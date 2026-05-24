import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ParentProfile } from './entities/parent-profile.entity';
import { ParentStudent } from './entities/parent-student.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { LessonProgress } from '../progress/entities/lesson-progress.entity';
import { Session } from '../sessions/entities/session.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ParentProfile)
    private parentRepo: Repository<ParentProfile>,

    @InjectRepository(ParentStudent)
    private linkRepo: Repository<ParentStudent>,

    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,

    @InjectRepository(LessonProgress)
    private progressRepo: Repository<LessonProgress>,

    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,

    private dataSource: DataSource,
  ) {}

  // ── Guard: verificar que el padre tiene acceso al alumno ─────────────────

  private async assertAccess(parentUserId: string, studentId: string): Promise<void> {
    const parent = await this.parentRepo.findOne({ where: { user_id: parentUserId } });
    if (!parent) throw new NotFoundException('Perfil de padre no encontrado.');

    const link = await this.linkRepo.findOne({
      where: { parent_id: parent.id, student_id: studentId, status: 'confirmed' },
    });
    if (!link) throw new ForbiddenException('Este alumno no está vinculado a tu cuenta.');
  }

  // ── 1. Resumen del hijo ───────────────────────────────────────────────────

  async getChildSummary(parentUserId: string, studentId: string) {
    await this.assertAccess(parentUserId, studentId);

    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Perfil del alumno no encontrado.');

    const XP_PER_LEVEL = 100;
    const xp_to_next_level = XP_PER_LEVEL - (student.xp_total % XP_PER_LEVEL);

    // Progreso de lecciones
    const allProgress = await this.progressRepo.find({
      where: { student_id: studentId },
    });
    const completed = allProgress.filter((p) => p.status === 'completed');
    const total_stars = completed.reduce((s, p) => s + p.stars, 0);
    const total_xp = completed.reduce((s, p) => s + p.xp_earned, 0);

    // Última sesión
    const lastSession = await this.sessionRepo.findOne({
      where: { student_id: studentId },
      order: { started_at: 'DESC' },
    });

    // Racha de días consecutivos
    const streak = await this.calculateStreak(studentId);

    return {
      student: {
        id: student.id,
        alias: student.alias,
        avatar_id: student.avatar_id,
        level: student.level,
        xp_total: student.xp_total,
        xp_to_next_level,
      },
      progress: {
        total_lessons: allProgress.length,
        completed_lessons: completed.length,
        completion_rate: allProgress.length > 0 ? Math.round((completed.length / allProgress.length) * 100) : 0,
        total_stars,
        total_xp,
      },
      streak_days: streak,
      last_session: lastSession
        ? {
            date: lastSession.started_at,
            ended_at: lastSession.ended_at,
            minigames_in_session: (lastSession.events ?? []).filter((e: any) => e.type === 'minigame').length,
          }
        : null,
    };
  }

  // ── 2. Historial de sesiones ──────────────────────────────────────────────

  async getChildSessions(parentUserId: string, studentId: string, days: number = 7) {
    await this.assertAccess(parentUserId, studentId);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const sessions = await this.sessionRepo.createQueryBuilder('s').where('s.student_id = :studentId', { studentId }).andWhere('s.started_at >= :since', { since }).andWhere('s.ended_at IS NOT NULL').orderBy('s.started_at', 'DESC').getMany();

    return sessions.map((s) => {
      const events = (s.events ?? []) as any[];
      const mgEvents = events.filter((e) => e.type === 'minigame');
      const xp_earned = mgEvents.reduce((sum, e) => sum + (e.xp_earned ?? 0), 0);
      const durationMs = s.ended_at ? new Date(s.ended_at).getTime() - new Date(s.started_at).getTime() : 0;

      return {
        session_id: s.id,
        date: s.started_at,
        duration_minutes: Math.round(durationMs / 60000),
        minigames_played: mgEvents.length,
        minigames_completed: mgEvents.filter((e) => e.completed).length,
        xp_earned,
      };
    });
  }

  // ── 3. Progreso detallado por lección ────────────────────────────────────

  async getChildLessonProgress(parentUserId: string, studentId: string) {
    await this.assertAccess(parentUserId, studentId);

    return this.dataSource.query(
      `SELECT
         lp.id::text         AS progress_id,
         l.title             AS lesson_title,
         lp.status,
         lp.stars,
         lp.score_pct,
         lp.xp_earned,
         lp.completed_at,
         lp.started_at
       FROM lesson_progress lp
       JOIN lessons l ON l.id::text = lp.lesson_id::text
       WHERE lp.student_id::text = $1
       ORDER BY lp.updated_at DESC`,
      [studentId],
    );
  }

  // ── 4. XP semanal para el gráfico ────────────────────────────────────────

  async getWeeklyXp(parentUserId: string, studentId: string, weeks: number = 4) {
    await this.assertAccess(parentUserId, studentId);

    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);

    const rows = await this.dataSource.query(
      `SELECT
         DATE_TRUNC('week', s.started_at) AS week_start,
         COALESCE(
           SUM((e->>'xp_earned')::int), 0
         ) AS xp_earned
       FROM sessions s,
            LATERAL jsonb_array_elements(s.events) AS e
       WHERE s.student_id::text = $1
         AND s.started_at >= $2
         AND e->>'type' = 'minigame'
       GROUP BY week_start
       ORDER BY week_start`,
      [studentId, since],
    );

    return rows;
  }

  // ── Helper: racha de días ─────────────────────────────────────────────────

  private async calculateStreak(studentId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT DATE(started_at) AS session_date
       FROM sessions
       WHERE student_id::text = $1
         AND ended_at IS NOT NULL
       ORDER BY session_date DESC`,
      [studentId],
    );

    if (!rows.length) return 0;

    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    for (const row of rows) {
      const d = new Date(row.session_date);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((checkDate.getTime() - d.getTime()) / 86400000);

      if (diff === 0 || diff === 1) {
        streak++;
        checkDate = d;
      } else {
        break;
      }
    }

    return streak;
  }
}
