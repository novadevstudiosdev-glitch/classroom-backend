import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { StartSessionDto } from './dto/start-session.dto';
import { MinigameEventDto } from './dto/minigame-event.dto';
import { SessionEvent } from './interfaces/session-event.interface';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private sessionRepo: Repository<Session>,
    @InjectRepository(Minigame)
    private minigameRepo: Repository<Minigame>,
    @InjectRepository(MinigameInstance)
    private instanceRepo: Repository<MinigameInstance>,
    private dataSource: DataSource,
  ) {}

  async startSession(studentProfileId: string, dto: StartSessionDto): Promise<Session> {
    const session = this.sessionRepo.create({
      student_id: studentProfileId,
      classroom_id: dto.classroom_id ?? null,
      lesson_id: dto.lesson_id ?? null,
      events: [],
    });
    return this.sessionRepo.save(session);
  }

  async endSession(sessionId: string, studentProfileId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesión no encontrada.');
    if (session.student_id !== studentProfileId) throw new ForbiddenException('No autorizado.');
    if (session.ended_at) return session;

    session.ended_at = new Date();
    return this.sessionRepo.save(session);
  }

  async addMinigameEvent(studentProfileId: string, dto: MinigameEventDto): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: dto.session_id } });
    if (!session) throw new NotFoundException('Sesión no encontrada.');
    if (session.student_id !== studentProfileId) throw new ForbiddenException('No autorizado.');
    if (session.ended_at) throw new ForbiddenException('La sesión ya terminó.');

    // Validar que el minijuego existe y está activo
    const minigame = await this.minigameRepo.findOne({
      where: { id: dto.minigame_id, is_active: true },
    });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');

    // Prevenir doble envío del mismo minijuego en la misma sesión
    const alreadyPlayed = session.events.some(
      (e) => e.type === 'minigame' && e.minigame_id === dto.minigame_id,
    );
    if (alreadyPlayed) {
      throw new ConflictException('Este minijuego ya fue registrado en esta sesión.');
    }

    const xpEarned = dto.completed
      ? Math.round((dto.score / dto.max_score) * 30)
      : 0;

    // Feature 13: guardar snapshot del content_json al momento de jugar
    let content_snapshot: Record<string, any>[] | undefined;
    if (dto.instance_id) {
      const instance = await this.instanceRepo.findOne({ where: { id: dto.instance_id } });
      if (instance) content_snapshot = instance.content_json;
    }

    const event: SessionEvent = {
      type: 'minigame',
      minigame_id: dto.minigame_id,
      minigame_slug: minigame.slug,
      score: dto.score,
      max_score: dto.max_score,
      completed: dto.completed,
      xp_earned: xpEarned,
      occurred_at: new Date().toISOString(),
      content_snapshot,
    };

    session.events = [...session.events, event];

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Session, session);

      if (xpEarned > 0) {
        await manager.increment(StudentProfile, { id: studentProfileId }, 'xp_total', xpEarned);
        const profile = await manager.findOne(StudentProfile, { where: { id: studentProfileId } });
        if (profile) {
          profile.level = Math.floor(profile.xp_total / 100) + 1;
          await manager.save(StudentProfile, profile);
        }
      }
    });

    return session;
  }
}
