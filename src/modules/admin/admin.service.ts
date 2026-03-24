import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
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
        new_last_7_days: recentRow[0].new_users,
      },
      content: {
        active_classrooms: classrooms[0].total,
        published_lessons: lessons[0].total,
        active_minigames: minigames[0].total,
      },
      engagement: {
        total_xp_distributed: xpRow[0].total_xp,
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

  async suspendUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.deleted_at) throw new ConflictException('El usuario ya está suspendido.');

    await this.userRepo.softDelete(userId);

    this.logger.log(`Admin suspendió usuario: ${user.email}`);
    return { message: `Usuario ${user.email} suspendido correctamente.` };
  }

  async restoreUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.deleted_at) throw new ConflictException('El usuario no está suspendido.');

    await this.userRepo.restore(userId);

    this.logger.log(`Admin restauró usuario: ${user.email}`);
    return { message: `Usuario ${user.email} restaurado correctamente.` };
  }

  async deleteUser(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');

    await this.userRepo.delete(userId);

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
        last_7_days: sessions7[0].total,
        last_30_days: sessions30[0].total,
      },
      lesson_completions: {
        last_7_days: completions7[0].total,
        last_30_days: completions30[0].total,
      },
      top_students: topStudents,
      top_teachers: topTeachers,
    };
  }

  // ─────────────────────────────────────────────────
  // GESTIÓN DE MINIGAMES
  // ─────────────────────────────────────────────────

  async listMinigames() {
    return this.minigameRepo.find({ order: { created_at: 'DESC' } });
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

  async deleteMinigame(id: string) {
    const minigame = await this.minigameRepo.findOne({ where: { id } });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');

    await this.minigameRepo.remove(minigame);
    this.logger.log(`Admin eliminó minijuego: ${minigame.slug}`);
    return { message: `Minijuego "${minigame.slug}" eliminado.` };
  }
}
