import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { parse } from 'csv-parse/sync';
import * as bcrypt from 'bcrypt';

import { Classroom } from './entities/classroom.entity';
import { ClassroomStudent } from './entities/classroom-student.entity';
import { TeachersService } from '../teachers/teachers.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { StudentsService } from '../students/students.service';
import { User } from '../users/entities/user.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';

// Límite de clases activas para plan gratuito
const FREE_PLAN_CLASSROOM_LIMIT = 1;

@Injectable()
export class ClassroomsService {
  private readonly logger = new Logger(ClassroomsService.name);

  constructor(
    @InjectRepository(Classroom)
    private classroomRepo: Repository<Classroom>,

    @InjectRepository(ClassroomStudent)
    private classroomStudentRepo: Repository<ClassroomStudent>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(StudentProfile)
    private studentProfileRepo: Repository<StudentProfile>,

    private teachersService: TeachersService,
    private studentsService: StudentsService,
    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────
  // CREAR CLASE
  // ─────────────────────────────────────────────────

  async create(teacherUserId: string, dto: CreateClassroomDto): Promise<Classroom> {
    const teacher = await this.teachersService.getProfileOrFail(teacherUserId);

    // Validar límite del plan gratuito
    if (teacher.plan_type === 'free') {
      const activeCount = await this.classroomRepo.count({
        where: { teacher_id: teacher.id, is_archived: false },
      });

      if (activeCount >= FREE_PLAN_CLASSROOM_LIMIT) {
        throw new ForbiddenException(`El plan gratuito permite hasta ${FREE_PLAN_CLASSROOM_LIMIT} clase activa. ` + `Archivá una clase existente o pasate al plan Pro.`);
      }
    }

    const invite_code = await this.generateUniqueInviteCode();

    const classroom = this.classroomRepo.create({
      name: dto.name,
      description: dto.description,
      grade_level: dto.grade_level as any,
      teacher_id: teacher.id,
      invite_code,
      is_archived: false,
    });

    await this.classroomRepo.save(classroom);

    this.logger.log(`Clase creada: "${classroom.name}" (código: ${invite_code}) por docente ${teacherUserId}`);

    return classroom;
  }

  // ─────────────────────────────────────────────────
  // LISTAR CLASES DEL DOCENTE
  // ─────────────────────────────────────────────────

  async findAllByTeacher(teacherUserId: string, archived: boolean = false) {
    const teacher = await this.teachersService.getProfileOrFail(teacherUserId);

    const rows = await this.dataSource.query(
      `SELECT
         c.*,
         COUNT(cs.student_id)::int AS students_count
       FROM classrooms c
       LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
       WHERE c.teacher_id = $1
         AND c.is_archived = $2
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [teacher.id, archived],
    );

    return rows;
  }

  // ─────────────────────────────────────────────────
  // OBTENER CLASE POR ID
  // ─────────────────────────────────────────────────

  async findOne(classroomId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new NotFoundException('Clase no encontrada.');
    }

    await this.assertOwnership(classroom, teacherUserId);

    // Traer alumnos con su perfil
    const classroomStudents = await this.classroomStudentRepo.find({
      where: { classroom_id: classroomId },
      relations: ['student'],
      order: { joined_at: 'ASC' },
    });

    const students = classroomStudents.map((cs) => ({
      student_id: cs.student_id,
      alias: cs.student?.alias,
      avatar_id: cs.student?.avatar_id,
      level: cs.student?.level,
      xp_total: cs.student?.xp_total,
      joined_at: cs.joined_at,
      last_activity: cs.last_activity,
    }));

    return { ...classroom, students };
  }

  // ─────────────────────────────────────────────────
  // ACTUALIZAR CLASE
  // ─────────────────────────────────────────────────

  async update(classroomId: string, teacherUserId: string, dto: UpdateClassroomDto): Promise<Classroom> {
    const classroom = await this.classroomRepo.findOne({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new NotFoundException('Clase no encontrada.');
    }

    await this.assertOwnership(classroom, teacherUserId);

    // Si intenta desarchivar, verificar límite del plan
    if (dto.is_archived === false && classroom.is_archived) {
      const teacher = await this.teachersService.getProfileOrFail(teacherUserId);

      if (teacher.plan_type === 'free') {
        const activeCount = await this.classroomRepo.count({
          where: { teacher_id: teacher.id, is_archived: false },
        });

        if (activeCount >= FREE_PLAN_CLASSROOM_LIMIT) {
          throw new ForbiddenException('No podés desarchivar esta clase: alcanzaste el límite del plan gratuito.');
        }
      }
    }

    Object.assign(classroom, dto);
    return this.classroomRepo.save(classroom);
  }

  // ─────────────────────────────────────────────────
  // ELIMINAR CLASE (soft delete via archive)
  // ─────────────────────────────────────────────────

  async remove(classroomId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new NotFoundException('Clase no encontrada.');
    }

    await this.assertOwnership(classroom, teacherUserId);

    // Soft delete: archivamos en vez de borrar para preservar el historial
    classroom.is_archived = true;
    await this.classroomRepo.save(classroom);

    this.logger.log(`Clase archivada (soft delete): ${classroomId}`);

    return { message: 'Clase eliminada correctamente.' };
  }

  // ─────────────────────────────────────────────────
  // REGENERAR CÓDIGO DE INVITACIÓN
  // ─────────────────────────────────────────────────

  async regenerateInviteCode(classroomId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new NotFoundException('Clase no encontrada.');
    }

    await this.assertOwnership(classroom, teacherUserId);

    const invite_code = await this.generateUniqueInviteCode();
    classroom.invite_code = invite_code;
    await this.classroomRepo.save(classroom);

    this.logger.log(`Código regenerado para clase ${classroomId}: ${invite_code}`);

    return { invite_code };
  }

  // ─────────────────────────────────────────────────
  // REMOVER ALUMNO DE LA CLASE
  // ─────────────────────────────────────────────────

  async removeStudent(classroomId: string, studentId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new NotFoundException('Clase no encontrada.');
    }

    await this.assertOwnership(classroom, teacherUserId);

    const classroomStudent = await this.classroomStudentRepo.findOne({
      where: { classroom_id: classroomId, student_id: studentId },
    });

    if (!classroomStudent) {
      throw new NotFoundException('El alumno no pertenece a esta clase.');
    }

    classroomStudent.left_at = new Date();
    await this.classroomStudentRepo.save(classroomStudent);

    // Soft delete del lesson_progress para lecciones de esta clase
    await this.softDeleteProgressForClassroom(studentId, classroomId);

    return { message: 'Alumno removido de la clase.' };
  }

  // ─────────────────────────────────────────────────
  // ALUMNO — SALIR DE UNA CLASE
  // ─────────────────────────────────────────────────

  async leaveClassroom(classroomId: string, studentUserId: string) {
    const student = await this.studentsService.getProfile(studentUserId);

    const classroomStudent = await this.classroomStudentRepo.findOne({
      where: { classroom_id: classroomId, student_id: student.id },
    });

    if (!classroomStudent) {
      throw new NotFoundException('No pertenecés a esta clase.');
    }

    if (classroomStudent.left_at) {
      throw new ConflictException('Ya saliste de esta clase.');
    }

    classroomStudent.left_at = new Date();
    await this.classroomStudentRepo.save(classroomStudent);

    await this.softDeleteProgressForClassroom(student.id, classroomId);

    this.logger.log(`Alumno ${student.id} salió de la clase ${classroomId}`);

    return { message: 'Saliste de la clase correctamente.' };
  }

  // ─────────────────────────────────────────────────
  // PROGRESO — MATRIZ LECCIONES × ALUMNOS
  // (Placeholder: se completa cuando exista el módulo lessons/progress)
  // ─────────────────────────────────────────────────

  async getProgress(classroomId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({ where: { id: classroomId } });
    if (!classroom) throw new NotFoundException('Clase no encontrada.');
    await this.assertOwnership(classroom, teacherUserId);

    // Alumnos de la clase
    const students = await this.dataSource.query(
      `SELECT sp.id::text AS student_id, sp.alias, sp.avatar_id, sp.xp_total, sp.level
       FROM classroom_students cs
       JOIN student_profiles sp ON sp.id::text = cs.student_id::text
       WHERE cs.classroom_id::text = $1
       ORDER BY sp.alias ASC`,
      [classroomId],
    );

    // Lecciones asignadas a la clase
    const lessons = await this.dataSource.query(
      `SELECT l.id::text AS lesson_id, l.title, la.due_date, la.assigned_at
       FROM lesson_assignments la
       JOIN lessons l ON l.id::text = la.lesson_id::text
       WHERE la.classroom_id::text = $1
         AND l.deleted_at IS NULL
       ORDER BY la.assigned_at ASC`,
      [classroomId],
    );

    // Progreso de cada alumno por cada lección
    const progress = await this.dataSource.query(
      `SELECT
         lp.student_id::text,
         lp.lesson_id::text,
         lp.status,
         lp.stars,
         lp.score_pct,
         lp.xp_earned,
         lp.completed_at
       FROM lesson_progress lp
       WHERE lp.student_id::text IN (
         SELECT student_id::text FROM classroom_students WHERE classroom_id::text = $1
       )
       AND lp.lesson_id::text IN (
         SELECT lesson_id::text FROM lesson_assignments WHERE classroom_id::text = $1
       )`,
      [classroomId],
    );

    return {
      classroom_id: classroomId,
      classroom_name: classroom.name,
      students,
      lessons,
      progress,
    };
  }

  // ─────────────────────────────────────────────────
  // ALUMNO — UNIRSE A UNA CLASE CON CÓDIGO
  // ─────────────────────────────────────────────────

  async joinClassroom(studentProfileId: string, invite_code: string) {
    const classroom = await this.classroomRepo.findOne({
      where: { invite_code: invite_code.toUpperCase(), is_archived: false },
    });

    if (!classroom) {
      throw new NotFoundException('Código de invitación inválido o la clase no existe.');
    }

    const alreadyJoined = await this.classroomStudentRepo.findOne({
      where: { classroom_id: classroom.id, student_id: studentProfileId },
    });

    if (alreadyJoined) {
      throw new ConflictException('Ya sos parte de esta clase.');
    }

    const classroomStudent = this.classroomStudentRepo.create({
      classroom_id: classroom.id,
      student_id: studentProfileId,
    });

    await this.classroomStudentRepo.save(classroomStudent);

    this.logger.log(`Alumno ${studentProfileId} se unió a la clase ${classroom.name}`);

    return {
      message: `¡Te uniste a ${classroom.name}!`,
      classroom_id: classroom.id,
      name: classroom.name,
    };
  }

  // ─────────────────────────────────────────────────
  // VISTA DEL ALUMNO — sus clases activas
  // ─────────────────────────────────────────────────

  async findAllByStudent(studentProfileId: string) {
    const classroomStudents = await this.classroomStudentRepo.find({
      where: { student_id: studentProfileId },
      relations: ['classroom'],
      order: { joined_at: 'DESC' },
    });

    return classroomStudents
      .filter((cs) => cs.classroom && !cs.classroom.is_archived)
      .map((cs) => ({
        classroom_id: cs.classroom.id,
        name: cs.classroom.name,
        description: cs.classroom.description,
        grade_level: cs.classroom.grade_level,
        joined_at: cs.joined_at,
        last_activity: cs.last_activity,
      }));
  }

  // ─────────────────────────────────────────────────
  // STATS DE LA CLASE
  // ─────────────────────────────────────────────────

  async getStats(classroomId: string, teacherUserId: string) {
    const classroom = await this.classroomRepo.findOne({ where: { id: classroomId } });
    if (!classroom) throw new NotFoundException('Clase no encontrada.');
    await this.assertOwnership(classroom, teacherUserId);

    // Total de alumnos en la clase
    const [{ total_students }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total_students
       FROM classroom_students
       WHERE classroom_id::text = $1`,
      [classroomId],
    );

    // Lecciones asignadas con estadísticas de progreso
    const completions = await this.dataSource.query(
      `SELECT
         l.id::text          AS lesson_id,
         l.title             AS lesson_title,
         COUNT(lp.id)::int   AS completed_count,
         ROUND(AVG(lp.score_pct)::numeric, 1)::float AS avg_score,
         ROUND(AVG(lp.stars)::numeric, 1)::float      AS avg_stars
       FROM lesson_assignments la
       JOIN lessons l ON l.id::text = la.lesson_id::text
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id::text = l.id::text
         AND lp.status = 'completed'
         AND lp.student_id::text IN (
           SELECT student_id::text FROM classroom_students WHERE classroom_id::text = $1
         )
       WHERE la.classroom_id::text = $1
       GROUP BY l.id, l.title
       ORDER BY l.title`,
      [classroomId],
    );

    // Top 5 alumnos por XP en la clase
    const top_students = await this.dataSource.query(
      `SELECT
         sp.id::text   AS student_id,
         sp.alias,
         sp.avatar_id,
         sp.xp_total,
         sp.level
       FROM classroom_students cs
       JOIN student_profiles sp ON sp.id::text = cs.student_id::text
       WHERE cs.classroom_id::text = $1
       ORDER BY sp.xp_total DESC
       LIMIT 5`,
      [classroomId],
    );

    return {
      classroom_id: classroomId,
      classroom_name: classroom.name,
      total_students,
      lessons_assigned: completions.length,
      completions,
      top_students,
    };
  }

  // ─────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────

  private async assertOwnership(classroom: Classroom, teacherUserId: string): Promise<void> {
    const teacher = await this.teachersService.getProfileOrFail(teacherUserId);

    if (classroom.teacher_id !== teacher.id) {
      throw new ForbiddenException('No tenés permiso para acceder a esta clase.');
    }
  }

  // ─────────────────────────────────────────────────
  // CSV IMPORT DE ALUMNOS
  // ─────────────────────────────────────────────────

  async importStudentsCsv(classroomId: string, teacherUserId: string, csvBuffer: Buffer) {
    const classroom = await this.classroomRepo.findOne({ where: { id: classroomId } });
    if (!classroom) throw new NotFoundException('Clase no encontrada.');
    await this.assertOwnership(classroom, teacherUserId);

    let rows: { email: string; alias: string }[];
    try {
      rows = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      throw new BadRequestException('Formato de CSV inválido. Columnas requeridas: email, alias');
    }

    if (!rows.length) throw new BadRequestException('El CSV está vacío.');

    const results = { imported: 0, already_existed: 0, added_to_class: 0, failed: [] as { row: number; email: string; reason: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const { email, alias } = rows[i];

      if (!email || !alias) {
        results.failed.push({ row: i + 2, email: email || '', reason: 'email o alias vacío' });
        continue;
      }

      try {
        let user = await this.userRepo.findOne({ where: { email: email.toLowerCase() } });
        let profile: StudentProfile | null = null;

        if (!user) {
          // Crear cuenta con contraseña temporal
          const tempPassword = randomBytes(8).toString('hex');
          const password_hash = await bcrypt.hash(tempPassword, 12);

          await this.dataSource.transaction(async (manager) => {
            user = manager.create(User, { email: email.toLowerCase(), password_hash, role: 'student', is_verified: true });
            await manager.save(user);
            profile = manager.create(StudentProfile, { user_id: user!.id, alias, xp_total: 0, level: 1 });
            await manager.save(profile);
          });

          results.imported++;
        } else {
          profile = await this.studentProfileRepo.findOne({ where: { user_id: user.id } });
          results.already_existed++;
        }

        if (!profile) continue;

        const already = await this.classroomStudentRepo.findOne({
          where: { classroom_id: classroomId, student_id: profile.id },
        });

        if (!already) {
          const cs = this.classroomStudentRepo.create({ classroom_id: classroomId, student_id: profile.id });
          await this.classroomStudentRepo.save(cs);
          results.added_to_class++;
        }
      } catch (err) {
        results.failed.push({ row: i + 2, email, reason: (err as Error).message });
      }
    }

    this.logger.log(`CSV import en clase ${classroomId}: ${results.imported} nuevos, ${results.added_to_class} agregados`);
    return results;
  }

  private async softDeleteProgressForClassroom(studentId: string, classroomId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE lesson_progress
       SET deleted_at = NOW()
       WHERE deleted_at IS NULL
         AND student_id::text = $1
         AND lesson_id::text IN (
           SELECT lesson_id::text FROM lesson_assignments WHERE classroom_id::text = $2
         )`,
      [studentId, classroomId],
    );
  }

  private async generateUniqueInviteCode(): Promise<string> {
    const MAX_ATTEMPTS = 10;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // Genera código de 6 chars alfanuméricos en mayúsculas
      // Excluye chars ambiguos: 0, O, I, 1 para evitar confusiones
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from({ length: 6 }, () => chars[randomBytes(1)[0] % chars.length]).join('');

      const exists = await this.classroomRepo.findOne({
        where: { invite_code: code },
      });

      if (!exists) return code;
    }

    throw new BadRequestException('No se pudo generar un código único. Intentá de nuevo.');
  }
}
