import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TeacherProfile } from './entities/teacher-profile.entity';
import { StudentNote } from './entities/student-note.entity';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(TeacherProfile)
    private teacherRepo: Repository<TeacherProfile>,

    @InjectRepository(StudentNote)
    private noteRepo: Repository<StudentNote>,

    private dataSource: DataSource,
  ) {}

  async getProfile(userId: string): Promise<TeacherProfile> {
    const profile = await this.teacherRepo.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de docente no encontrado.');
    }

    return profile;
  }

  async getProfileOrFail(userId: string): Promise<TeacherProfile> {
    const profile = await this.teacherRepo.findOne({ where: { user_id: userId } });
    if (!profile) throw new ForbiddenException('Solo los docentes pueden realizar esta acción.');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateTeacherDto): Promise<TeacherProfile> {
    const profile = await this.getProfile(userId);
    Object.assign(profile, dto);
    return this.teacherRepo.save(profile);
  }

  // ─────────────────────────────────────────────────
  // ESTADÍSTICAS GLOBALES DE ALUMNOS DEL DOCENTE
  // ─────────────────────────────────────────────────

  async getStudentStats(teacherUserId: string) {
    const teacher = await this.getProfileOrFail(teacherUserId);

    // Total de alumnos únicos en todas sus clases activas (no archivadas)
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT cs.student_id)::int AS total
       FROM classroom_students cs
       JOIN classrooms c ON c.id::text = cs.classroom_id::text
       WHERE c.teacher_id::text = $1
         AND c.is_archived = false`,
      [teacher.id],
    );

    // Activos: tuvieron actividad en los últimos 30 días
    const [{ active }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT cs.student_id)::int AS active
       FROM classroom_students cs
       JOIN classrooms c ON c.id::text = cs.classroom_id::text
       WHERE c.teacher_id::text = $1
         AND c.is_archived = false
         AND cs.last_activity >= NOW() - INTERVAL '30 days'`,
      [teacher.id],
    );

    // Atrasados: tienen al menos una lección con due_date vencida y no completada
    const [{ behind }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT cs.student_id)::int AS behind
       FROM classroom_students cs
       JOIN classrooms c ON c.id::text = cs.classroom_id::text
       JOIN lesson_assignments la ON la.classroom_id::text = c.id::text
       WHERE c.teacher_id::text = $1
         AND c.is_archived = false
         AND la.due_date IS NOT NULL
         AND la.due_date < NOW()
         AND NOT EXISTS (
           SELECT 1 FROM lesson_progress lp
           WHERE lp.student_id::text = cs.student_id::text
             AND lp.lesson_id::text = la.lesson_id::text
             AND lp.status = 'completed'
             AND lp.deleted_at IS NULL
         )`,
      [teacher.id],
    );

    // Baja participación: promedio de score_pct en sus lecciones < 50%
    const [{ low_participation }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT student_id)::int AS low_participation
       FROM (
         SELECT
           cs.student_id,
           COALESCE(AVG(lp.score_pct), 0) AS avg_score
         FROM classroom_students cs
         JOIN classrooms c ON c.id::text = cs.classroom_id::text
         LEFT JOIN lesson_progress lp
           ON lp.student_id::text = cs.student_id::text
           AND lp.deleted_at IS NULL
         WHERE c.teacher_id::text = $1
           AND c.is_archived = false
         GROUP BY cs.student_id
         HAVING COALESCE(AVG(lp.score_pct), 0) < 50
       ) sub`,
      [teacher.id],
    );

    return { total, active, behind, low_participation };
  }

  // ─────────────────────────────────────────────────
  // NOTAS DEL DOCENTE SOBRE UN ALUMNO
  // ─────────────────────────────────────────────────

  async addNote(teacherUserId: string, studentId: string, content: string): Promise<StudentNote> {
    const teacher = await this.getProfileOrFail(teacherUserId);

    const note = this.noteRepo.create({
      teacher_id: teacher.id,
      student_id: studentId,
      content,
    });

    return this.noteRepo.save(note);
  }

  async getNotesByStudent(teacherUserId: string, studentId: string) {
    const teacher = await this.getProfileOrFail(teacherUserId);

    const notes = await this.noteRepo.find({
      where: { teacher_id: teacher.id, student_id: studentId },
      order: { created_at: 'DESC' },
    });

    // Agrupar por mes (YYYY-MM)
    const grouped: Record<string, typeof notes> = {};
    for (const note of notes) {
      const key = note.created_at.toISOString().slice(0, 7); // "2026-04"
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(note);
    }

    return Object.entries(grouped).map(([month, items]) => ({ month, notes: items }));
  }

  async deleteNote(teacherUserId: string, noteId: string): Promise<void> {
    const teacher = await this.getProfileOrFail(teacherUserId);

    const note = await this.noteRepo.findOne({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota no encontrada.');
    if (note.teacher_id !== teacher.id) throw new ForbiddenException('No tenés permiso para eliminar esta nota.');

    await this.noteRepo.remove(note);
  }
}
