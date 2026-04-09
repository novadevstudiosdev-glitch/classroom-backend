import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { StudentProfile } from './entities/student-profile.entity';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { ParentStudent } from '../parents/entities/parent-student.entity';
import { ParentProfile } from '../parents/entities/parent-profile.entity';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,

    @InjectRepository(ParentStudent)
    private parentStudentRepo: Repository<ParentStudent>,

    @InjectRepository(ParentProfile)
    private parentProfileRepo: Repository<ParentProfile>,

    private dataSource: DataSource,
  ) {}

  async getProfile(userId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de alumno no encontrado.');
    }

    return profile;
  }

  async getProfileById(profileId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Perfil de alumno no encontrado.');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateStudentProfileDto): Promise<StudentProfile> {
    const profile = await this.getProfile(userId);
    Object.assign(profile, dto);
    return this.studentRepo.save(profile);
  }

  async generateLinkCode(userId: string): Promise<{ link_code: string }> {
    const profile = await this.getProfile(userId);

    if (profile.link_code) {
      return { link_code: profile.link_code };
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string = '';

    for (let i = 0; i < 10; i++) {
      code = Array.from({ length: 8 }, () => chars[randomBytes(1)[0] % chars.length]).join('');
      const exists = await this.studentRepo.findOne({ where: { link_code: code } });
      if (!exists) break;
    }

    profile.link_code = code;
    await this.studentRepo.save(profile);

    return { link_code: code };
  }

  async addXp(profileId: string, xpToAdd: number): Promise<StudentProfile> {
    await this.studentRepo.increment({ id: profileId }, 'xp_total', xpToAdd);
    const profile = await this.getProfileById(profileId);
    profile.level = Math.floor(profile.xp_total / 100) + 1;
    return this.studentRepo.save(profile);
  }

  // ─── Parent requests ────────────────────────────────────────────────────────

  async getParentRequests(userId: string) {
    const student = await this.getProfile(userId);

    const requests = await this.parentStudentRepo.find({
      where: { student_id: student.id, status: 'pending' },
    });

    if (requests.length === 0) return [];

    const parentIds = requests.map((r) => r.parent_id);
    const parents = await this.parentProfileRepo
      .createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: parentIds })
      .getMany();

    return requests.map((r) => {
      const parent = parents.find((p) => p.id === r.parent_id);
      return {
        id: r.id,
        parent_id: r.parent_id,
        parent_name: parent ? `${parent.first_name} ${parent.last_name}` : null,
        status: r.status,
        created_at: r.created_at,
      };
    });
  }

  async confirmParentRequest(userId: string, requestId: string) {
    const student = await this.getProfile(userId);

    const request = await this.parentStudentRepo.findOne({
      where: { id: requestId, student_id: student.id, status: 'pending' },
    });

    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    request.status = 'confirmed';
    await this.parentStudentRepo.save(request);

    return { message: 'Vinculación confirmada.' };
  }

  async rejectParentRequest(userId: string, requestId: string) {
    const student = await this.getProfile(userId);

    const request = await this.parentStudentRepo.findOne({
      where: { id: requestId, student_id: student.id, status: 'pending' },
    });

    if (!request) throw new NotFoundException('Solicitud no encontrada.');

    request.status = 'rejected';
    await this.parentStudentRepo.save(request);

    return { message: 'Solicitud rechazada.' };
  }

  // ─── Student feed ─────────────────────────────────────────────────────────

  async getFeed(userId: string) {
    const student = await this.getProfile(userId);

    const classrooms = await this.dataSource.query<{ classroom_id: string; name: string; grade_level: string }[]>(
      `SELECT cs.classroom_id::text, c.name, c.grade_level
       FROM classroom_students cs
       JOIN classrooms c ON c.id::text = cs.classroom_id::text
       WHERE cs.student_id::text = $1
         AND cs.left_at IS NULL
         AND c.is_archived = false`,
      [student.id],
    );

    if (classrooms.length === 0) return { classrooms: [] };

    const classroomIds = classrooms.map((c) => c.classroom_id);

    const lessons = await this.dataSource.query(
      `SELECT
         la.id::text           AS assignment_id,
         la.classroom_id::text AS classroom_id,
         la.due_date,
         la.is_closed,
         la.assigned_at,
         l.id::text            AS lesson_id,
         l.title,
         l.description,
         lp.status             AS progress_status,
         lp.stars,
         lp.score_pct,
         lp.xp_earned,
         lp.completed_at
       FROM lesson_assignments la
       JOIN lessons l ON l.id::text = la.lesson_id::text AND l.deleted_at IS NULL
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id::text = l.id::text
         AND lp.student_id::text = $1
         AND lp.deleted_at IS NULL
       WHERE la.classroom_id::text = ANY($2::text[])
       ORDER BY la.assigned_at DESC
       LIMIT 200`,
      [student.id, classroomIds],
    );

    const minigames = await this.dataSource.query(
      `SELECT
         mia.classroom_id::text AS classroom_id,
         mi.id::text            AS instance_id,
         mi.title,
         mi.description,
         mg.type                AS minigame_type,
         mia.assigned_at
       FROM minigame_instance_assignments mia
       JOIN minigame_instances mi ON mi.id::text = mia.instance_id::text AND mi.deleted_at IS NULL
       JOIN minigames mg ON mg.id::text = mi.minigame_id::text AND mg.deleted_at IS NULL
       WHERE mia.classroom_id::text = ANY($1::text[])
       ORDER BY mia.assigned_at DESC
       LIMIT 100`,
      [classroomIds],
    );

    return {
      classrooms: classrooms.map((c) => ({
        classroom_id: c.classroom_id,
        name: c.name,
        grade_level: c.grade_level,
        lessons: lessons.filter((l: any) => l.classroom_id === c.classroom_id),
        minigames: minigames.filter((m: any) => m.classroom_id === c.classroom_id),
      })),
    };
  }
}
