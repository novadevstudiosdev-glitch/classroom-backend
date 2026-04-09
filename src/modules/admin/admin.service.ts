import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { Notification, NotificationTargetRole } from '../notifications/entities/notification.entity';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateMinigameDto } from './dto/create-minigame.dto';
import { UpdateMinigameDto } from './dto/update-minigame.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Minigame)
    private minigameRepo: Repository<Minigame>,

    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,

    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,

    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────────
  // STATS GLOBALES
  // ─────────────────────────────────────────────────

  async getStats() {
    const [counts, xpRow, recentRow] = await Promise.all([
      // Usuarios por rol (solo activos)
      this.dataSource.query(`
        SELECT role, COUNT(*)::int AS total
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY role
      `),

      // XP total distribuido en la plataforma
      this.dataSource.query(`
        SELECT COALESCE(SUM(xp_total), 0)::int AS total_xp
        FROM student_profiles
      `),

      // Registros últimos 7 días
      this.dataSource.query(`
        SELECT COUNT(*)::int AS new_users
        FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
        AND deleted_at IS NULL
      `),
    ]);

    const byRole = Object.fromEntries(counts.map((r: any) => [r.role, r.total]));

    const [classrooms, lessons, minigames] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*)::int AS total FROM classrooms WHERE is_archived = false`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total FROM lessons WHERE status = 'published' AND deleted_at IS NULL`),
      this.dataSource.query(`SELECT COUNT(*)::int AS total FROM minigames WHERE is_active = true`),
    ]);

    return {
      users: {
        teachers: byRole['teacher'] ?? 0,
        students: byRole['student'] ?? 0,
        parents: byRole['parent'] ?? 0,
        admins: byRole['admin'] ?? 0,
        new_last_7_days: recentRow[0]?.new_users ?? 0,
      },
      content: {
        active_classrooms: classrooms[0]?.total ?? 0,
        published_lessons: lessons[0]?.total ?? 0,
        active_minigames: minigames[0]?.total ?? 0,
      },
      engagement: {
        total_xp_distributed: xpRow[0]?.total_xp ?? 0,
      },
    };
  }

  // ─────────────────────────────────────────────────
  // GESTIÓN DE USUARIOS
  // ─────────────────────────────────────────────────

  async listUsers(dto: ListUsersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const where: any = { deleted_at: IsNull() };
    if (dto.role) where.role = dto.role;

    const [users, total] = await this.userRepo.findAndCount({
      where,
      select: ['id', 'email', 'role', 'is_verified', 'created_at'],
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      users,
      meta: {
        total,
        page,
        per_page: limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
      select: ['id', 'email', 'role', 'is_verified', 'created_at', 'deleted_at'],
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  private async audit(adminId: string, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, any> = {}) {
    const log = this.auditLogRepo.create({ admin_id: adminId, action, target_type: targetType, target_id: targetId, metadata });
    await this.auditLogRepo.save(log);
  }

  async suspendUser(userId: string, adminId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.deleted_at) throw new ConflictException('El usuario ya está suspendido.');

    await this.userRepo.softDelete(userId);
    await this.audit(adminId, 'suspend_user', 'user', userId, { email: user.email });

    this.logger.log(`Admin suspendió usuario: ${user.email}`);
    return { message: `Usuario ${user.email} suspendido correctamente.` };
  }

  async restoreUser(userId: string, adminId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.deleted_at) throw new ConflictException('El usuario no está suspendido.');

    await this.userRepo.restore(userId);
    await this.audit(adminId, 'restore_user', 'user', userId, { email: user.email });

    this.logger.log(`Admin restauró usuario: ${user.email}`);
    return { message: `Usuario ${user.email} restaurado correctamente.` };
  }

  async deleteUser(userId: string, adminId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');

    await this.userRepo.delete(userId);
    await this.audit(adminId, 'delete_user', 'user', userId, { email: user.email });

    this.logger.log(`Admin eliminó permanentemente usuario: ${user.email}`);
    return { message: `Usuario ${user.email} eliminado permanentemente.` };
  }

  // ─────────────────────────────────────────────────
  // MÉTRICAS DE ACTIVIDAD
  // ─────────────────────────────────────────────────

  async getMetrics() {
    const [sessions7, sessions30, completions7, completions30, topStudents, topTeachers] = await Promise.all([
      // Sesiones últimos 7 días
      this.dataSource.query(`
        SELECT COUNT(*)::int AS total
        FROM sessions
        WHERE started_at >= NOW() - INTERVAL '7 days'
      `),

      // Sesiones últimos 30 días
      this.dataSource.query(`
        SELECT COUNT(*)::int AS total
        FROM sessions
        WHERE started_at >= NOW() - INTERVAL '30 days'
      `),

      // Lecciones completadas últimos 7 días
      this.dataSource.query(`
        SELECT COUNT(*)::int AS total
        FROM lesson_progress
        WHERE status = 'completed'
        AND completed_at >= NOW() - INTERVAL '7 days'
      `),

      // Lecciones completadas últimos 30 días
      this.dataSource.query(`
        SELECT COUNT(*)::int AS total
        FROM lesson_progress
        WHERE status = 'completed'
        AND completed_at >= NOW() - INTERVAL '30 days'
      `),

      // Top 5 alumnos por XP
      this.dataSource.query(`
        SELECT sp.alias, sp.xp_total, sp.level, u.email
        FROM student_profiles sp
        JOIN users u ON u.id::text = sp.user_id::text
        ORDER BY sp.xp_total DESC
        LIMIT 5
      `),

      // Top 5 docentes por cantidad de clases activas
      this.dataSource.query(`
        SELECT
          tp.first_name || ' ' || tp.last_name AS name,
          u.email,
          COUNT(c.id)::int AS active_classrooms
        FROM teacher_profiles tp
        JOIN users u ON u.id::text = tp.user_id::text
        LEFT JOIN classrooms c ON c.teacher_id::text = tp.id::text AND c.is_archived = false
        GROUP BY tp.id, tp.first_name, tp.last_name, u.email
        ORDER BY active_classrooms DESC
        LIMIT 5
      `),
    ]);

    return {
      sessions: {
        last_7_days: sessions7[0]?.total ?? 0,
        last_30_days: sessions30[0]?.total ?? 0,
      },
      lesson_completions: {
        last_7_days: completions7[0]?.total ?? 0,
        last_30_days: completions30[0]?.total ?? 0,
      },
      top_students: topStudents,
      top_teachers: topTeachers,
    };
  }

  // ─────────────────────────────────────────────────
  // GESTIÓN DE MINIGAMES
  // ─────────────────────────────────────────────────

  async listMinigames() {
    return this.minigameRepo.find({ order: { created_at: 'DESC' }, take: 200 });
  }

  async createMinigame(dto: CreateMinigameDto) {
    const exists = await this.minigameRepo.findOne({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException(`Ya existe un minijuego con slug "${dto.slug}".`);

    const minigame = this.minigameRepo.create({
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      config_json: dto.config_json ?? {},
      is_active: dto.is_active ?? true,
    });

    await this.minigameRepo.save(minigame);
    this.logger.log(`Admin creó minijuego: ${dto.slug}`);
    return minigame;
  }

  async updateMinigame(id: string, dto: UpdateMinigameDto) {
    const minigame = await this.minigameRepo.findOne({ where: { id } });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');

    Object.assign(minigame, dto);
    await this.minigameRepo.save(minigame);
    return minigame;
  }

  async toggleMinigame(id: string) {
    const minigame = await this.minigameRepo.findOne({ where: { id } });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');

    minigame.is_active = !minigame.is_active;
    await this.minigameRepo.save(minigame);

    this.logger.log(`Admin ${minigame.is_active ? 'activó' : 'desactivó'} minijuego: ${minigame.slug}`);
    return { id: minigame.id, slug: minigame.slug, is_active: minigame.is_active };
  }

  async deleteMinigame(id: string, adminUserId: string) {
    const minigame = await this.minigameRepo.findOne({ where: { id } });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');

    await this.dataSource.query(
      `UPDATE minigame_instances SET deleted_at = NOW() WHERE minigame_id::text = $1 AND deleted_at IS NULL`,
      [id],
    );

    await this.minigameRepo.softDelete(id);
    await this.audit(adminUserId, 'delete_minigame', 'minigame', id, { slug: minigame.slug });

    this.logger.log(`Admin ${adminUserId} soft-deleted minijuego: ${minigame.slug}`);
    return { message: `Minijuego "${minigame.slug}" eliminado. Se eliminará permanentemente en 7 días.` };
  }

  // ─────────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────────

  async getAuditLogs(page = 1, limit = 50, action?: string, adminId?: string) {
    const qb = this.auditLogRepo.createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (action) qb.andWhere('log.action = :action', { action });
    if (adminId) qb.andWhere('log.admin_id = :adminId', { adminId });

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { total, page, per_page: limit, total_pages: Math.ceil(total / limit) },
    };
  }

  // ─────────────────────────────────────────────────
  // DAILY TRENDS (últimos 30 días)
  // ─────────────────────────────────────────────────

  async getDailyTrends() {
    const [registrations, sessions, completions] = await Promise.all([
      this.dataSource.query(`
        SELECT DATE(created_at) AS day, COUNT(*)::int AS total
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND deleted_at IS NULL
        GROUP BY day ORDER BY day ASC
      `),
      this.dataSource.query(`
        SELECT DATE(started_at) AS day, COUNT(*)::int AS total
        FROM sessions
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day ASC
      `),
      this.dataSource.query(`
        SELECT DATE(completed_at) AS day, COUNT(*)::int AS total
        FROM lesson_progress
        WHERE status = 'completed'
          AND completed_at >= NOW() - INTERVAL '30 days'
          AND deleted_at IS NULL
        GROUP BY day ORDER BY day ASC
      `),
    ]);

    return { registrations, sessions, lesson_completions: completions };
  }

  // ─────────────────────────────────────────────────
  // CLASSROOM OVERSIGHT
  // ─────────────────────────────────────────────────

  async listAllClassrooms(page = 1, limit = 20, teacherId?: string) {
    let query = `
      SELECT
        c.id::text,
        c.name,
        c.grade_level,
        c.is_archived,
        c.created_at,
        tp.first_name || ' ' || tp.last_name AS teacher_name,
        u.email AS teacher_email,
        COUNT(cs.student_id)::int AS students_count
      FROM classrooms c
      JOIN teacher_profiles tp ON tp.id::text = c.teacher_id::text
      JOIN users u ON u.id::text = tp.user_id::text
      LEFT JOIN classroom_students cs ON cs.classroom_id::text = c.id::text AND cs.left_at IS NULL
    `;

    const params: any[] = [];
    if (teacherId) {
      params.push(teacherId);
      query += ` WHERE tp.user_id::text = $${params.length}`;
    }

    query += ` GROUP BY c.id, tp.first_name, tp.last_name, u.email ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, (page - 1) * limit);

    const countQuery = `SELECT COUNT(*)::int AS total FROM classrooms c JOIN teacher_profiles tp ON tp.id::text = c.teacher_id::text ${teacherId ? `WHERE tp.user_id::text = '${teacherId}'` : ''}`;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query(query, params),
      this.dataSource.query(countQuery),
    ]);

    return {
      data: rows,
      meta: { total: countResult[0]?.total ?? 0, page, per_page: limit, total_pages: Math.ceil((countResult[0]?.total ?? 0) / limit) },
    };
  }

  // ─────────────────────────────────────────────────
  // ALL LESSONS
  // ─────────────────────────────────────────────────

  async listAllLessons(page = 1, limit = 20, status?: string) {
    const offset = (page - 1) * limit;
    const params: any[] = [limit, offset];

    let where = `l.deleted_at IS NULL`;
    if (status) {
      params.push(status);
      where += ` AND l.status = $${params.length}`;
    }

    const [rows, countResult] = await Promise.all([
      this.dataSource.query(
        `SELECT l.id::text, l.title, l.status, l.created_at,
                tp.first_name || ' ' || tp.last_name AS teacher_name, u.email AS teacher_email
         FROM lessons l
         JOIN teacher_profiles tp ON tp.id::text = l.teacher_id::text
         JOIN users u ON u.id::text = tp.user_id::text
         WHERE ${where}
         ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      this.dataSource.query(`SELECT COUNT(*)::int AS total FROM lessons l WHERE ${where}`, status ? [status] : []),
    ]);

    return {
      data: rows,
      meta: { total: countResult[0]?.total ?? 0, page, per_page: limit, total_pages: Math.ceil((countResult[0]?.total ?? 0) / limit) },
    };
  }

  async unpublishLesson(lessonId: string, adminId: string) {
    const result = await this.dataSource.query(
      `UPDATE lessons SET status = 'draft' WHERE id::text = $1 AND status = 'published' RETURNING id, title`,
      [lessonId],
    );

    if (result.length === 0) throw new NotFoundException('Lección no encontrada o ya está en draft.');

    await this.audit(adminId, 'unpublish_lesson', 'lesson', lessonId, { title: result[0].title });

    return { message: `Lección "${result[0].title}" despublicada.` };
  }

  // ─────────────────────────────────────────────────
  // CSV EXPORT
  // ─────────────────────────────────────────────────

  async exportUsersAsCsv(role?: string): Promise<string> {
    let where = `deleted_at IS NULL`;
    const params: any[] = [];
    if (role) {
      params.push(role);
      where += ` AND role = $1`;
    }

    const users = await this.dataSource.query(
      `SELECT id, email, role, is_verified, created_at FROM users WHERE ${where} ORDER BY created_at DESC`,
      params,
    );

    const headers = ['id', 'email', 'role', 'is_verified', 'created_at'];
    const rows = users.map((u: any) =>
      headers.map((h) => `"${String(u[h] ?? '').replace(/"/g, '""')}"`).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  // ─────────────────────────────────────────────────
  // BROADCAST NOTIFICATION
  // ─────────────────────────────────────────────────

  async broadcast(adminId: string, title: string, message: string, target_role: NotificationTargetRole) {
    const notification = this.notificationRepo.create({ title, message, target_role, created_by: adminId });
    await this.notificationRepo.save(notification);

    await this.audit(adminId, 'broadcast_notification', 'notification', notification.id, { title, target_role });

    this.logger.log(`Admin ${adminId} broadcast: "${title}" → ${target_role}`);
    return notification;
  }

  async listNotifications(page = 1, limit = 20) {
    const [data, total] = await this.notificationRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { data, meta: { total, page, per_page: limit, total_pages: Math.ceil(total / limit) } };
  }
}
