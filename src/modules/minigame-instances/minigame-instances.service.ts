import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MinigameInstance } from './entities/minigame-instance.entity';
import { MinigameInstanceAssignment } from './entities/minigame-instance-assignment.entity';
import { MinigameResult } from './entities/minigame-result.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { TeachersService } from '../teachers/teachers.service';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { CreateMinigameInstanceDto } from './dto/create-minigame-instance.dto';
import { UpdateMinigameInstanceDto } from './dto/update-minigame-instance.dto';
import { AssignMinigameInstanceDto } from './dto/assign-minigame-instance.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Injectable()
export class MinigameInstancesService {
  private readonly logger = new Logger(MinigameInstancesService.name);

  constructor(
    @InjectRepository(MinigameInstance)
    private instanceRepo: Repository<MinigameInstance>,

    @InjectRepository(MinigameInstanceAssignment)
    private assignmentRepo: Repository<MinigameInstanceAssignment>,

    @InjectRepository(MinigameResult)
    private resultRepo: Repository<MinigameResult>,

    @InjectRepository(Minigame)
    private minigameRepo: Repository<Minigame>,

    private teachersService: TeachersService,

    @InjectRepository(Classroom)
    private classroomRepo: Repository<Classroom>,

    @InjectRepository(ClassroomStudent)
    private classroomStudentRepo: Repository<ClassroomStudent>,

    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,
  ) {}

  private async getTeacherId(userId: string): Promise<string> {
    const profile = await this.teachersService.getProfileOrFail(userId);
    return profile.id;
  }

  // ─── DOCENTE ────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateMinigameInstanceDto): Promise<MinigameInstance> {
    const teacher_id = await this.getTeacherId(userId);

    const template = await this.minigameRepo.findOne({
      where: { id: dto.minigame_id, is_active: true },
    });
    if (!template) throw new NotFoundException('Template de minijuego no encontrado.');

    const instance = this.instanceRepo.create({
      teacher_id,
      minigame_id: dto.minigame_id,
      title: dto.title,
      description: dto.description,
      content_json: dto.content_json,
      config_json: dto.config_json ?? {},
      is_public: false,
    });

    return this.instanceRepo.save(instance);
  }

  async findAllOwn(userId: string): Promise<MinigameInstance[]> {
    const teacher_id = await this.getTeacherId(userId);
    return this.instanceRepo.find({
      where: { teacher_id },
      order: { updated_at: 'DESC' },
      take: 100,
    });
  }

  async findAllPublic(): Promise<MinigameInstance[]> {
    return this.instanceRepo.find({
      where: { is_public: true },
      order: { updated_at: 'DESC' },
      take: 100,
    });
  }

  async findOne(id: string, userId: string, role: string): Promise<MinigameInstance> {
    const instance = await this.instanceRepo.findOne({ where: { id } });
    if (!instance) throw new NotFoundException('Minijuego no encontrado.');

    if (role === 'teacher') {
      const teacher_id = await this.getTeacherId(userId);
      if (instance.teacher_id !== teacher_id && !instance.is_public) {
        throw new ForbiddenException('No tenés acceso a este minijuego.');
      }
    }

    return instance;
  }

  async update(id: string, userId: string, dto: UpdateMinigameInstanceDto): Promise<MinigameInstance> {
    const teacher_id = await this.getTeacherId(userId);
    const instance = await this.instanceRepo.findOne({ where: { id } });

    if (!instance) throw new NotFoundException('Minijuego no encontrado.');
    if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');

    Object.assign(instance, dto);
    return this.instanceRepo.save(instance);
  }

  async remove(id: string, userId: string): Promise<void> {
    const teacher_id = await this.getTeacherId(userId);
    const instance = await this.instanceRepo.findOne({ where: { id } });

    if (!instance) throw new NotFoundException('Minijuego no encontrado.');
    if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');

    await this.instanceRepo.softDelete(id);
  }

  async forceDeleteOwn(id: string, userId: string, role: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({ where: { id } });
    if (!instance) throw new NotFoundException('Minijuego no encontrado.');

    if (role !== 'admin') {
      const teacher_id = await this.getTeacherId(userId);
      if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');
    }

    await this.instanceRepo.delete(id);
  }

  async assign(id: string, userId: string, dto: AssignMinigameInstanceDto): Promise<MinigameInstanceAssignment> {
    const teacher_id = await this.getTeacherId(userId);
    const instance = await this.instanceRepo.findOne({ where: { id } });

    if (!instance) throw new NotFoundException('Minijuego no encontrado.');
    if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');

    const classroom = await this.classroomRepo.findOne({
      where: { id: dto.classroom_id, teacher_id, is_archived: false },
    });
    if (!classroom) throw new NotFoundException('Clase no encontrada o no te pertenece.');

    const existing = await this.assignmentRepo.findOne({
      where: { instance_id: id, classroom_id: dto.classroom_id },
    });
    if (existing) throw new ConflictException('Este minijuego ya está asignado a esa clase.');

    const assignment = this.assignmentRepo.create({
      instance_id: id,
      classroom_id: dto.classroom_id,
    });

    return this.assignmentRepo.save(assignment);
  }

  async unassign(id: string, classroomId: string, userId: string): Promise<void> {
    const teacher_id = await this.getTeacherId(userId);
    const instance = await this.instanceRepo.findOne({ where: { id } });

    if (!instance) throw new NotFoundException('Minijuego no encontrado.');
    if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');

    await this.assignmentRepo.delete({ instance_id: id, classroom_id: classroomId });
  }

  async togglePublic(id: string, userId: string): Promise<MinigameInstance> {
    const teacher_id = await this.getTeacherId(userId);
    const instance = await this.instanceRepo.findOne({ where: { id } });

    if (!instance) throw new NotFoundException('Minijuego no encontrado.');
    if (instance.teacher_id !== teacher_id) throw new ForbiddenException('No sos el dueño de este minijuego.');

    instance.is_public = !instance.is_public;
    return this.instanceRepo.save(instance);
  }

  async clone(id: string, userId: string): Promise<MinigameInstance> {
    const teacher_id = await this.getTeacherId(userId);
    const source = await this.instanceRepo.findOne({ where: { id } });

    if (!source) throw new NotFoundException('Minijuego no encontrado.');
    if (!source.is_public && source.teacher_id !== teacher_id) {
      throw new ForbiddenException('Solo podés clonar minijuegos públicos o propios.');
    }

    const clone = this.instanceRepo.create({
      teacher_id,
      minigame_id: source.minigame_id,
      title: `Copia de ${source.title}`,
      description: source.description,
      content_json: source.content_json,
      config_json: source.config_json,
      is_public: false,
    });

    return this.instanceRepo.save(clone);
  }

  // ─── ALUMNO ─────────────────────────────────────────────────────────────────

  async findByClassroom(classroomId: string, studentProfileId: string): Promise<MinigameInstance[]> {
    // Validar que el alumno pertenece a la clase
    const membership = await this.classroomStudentRepo.findOne({
      where: { classroom_id: classroomId, student_id: studentProfileId },
    });
    if (!membership) throw new ForbiddenException('No pertenecés a esta clase.');

    const assignments = await this.assignmentRepo.find({
      where: { classroom_id: classroomId },
      relations: ['instance'],
    });

    return assignments.map((a) => a.instance);
  }

  // ─── QUIZ: PLAY & SUBMIT ─────────────────────────────────────────────────────

  /**
   * Retorna el minijuego listo para jugar:
   * - content_json con las preguntas pero SIN correct_option_id
   * - config_json completo
   * - indica si el alumno ya jugó antes (is_first_play)
   */
  async getForPlay(instanceId: string, studentProfileId: string) {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Minijuego no encontrado.');

    const previousPlay = await this.resultRepo.findOne({
      where: { instance_id: instanceId, student_id: studentProfileId },
      order: { played_at: 'DESC' },
    });

    // Quitar correct_option_id de cada pregunta antes de enviar al cliente
    const questionsForPlay = (instance.content_json as any[]).map((q) => {
      const { correct_option_id, ...rest } = q;
      void correct_option_id; // suprimir warning de variable no usada
      return rest;
    });

    // Si config pide shuffle, mezclar preguntas (semilla aleatoria por sesión)
    const config = instance.config_json as any;
    if (config?.shuffle_questions) {
      questionsForPlay.sort(() => Math.random() - 0.5);
    }

    return {
      id: instance.id,
      title: instance.title,
      description: instance.description,
      questions: questionsForPlay,
      config: instance.config_json,
      is_first_play: !previousPlay,
      play_count: previousPlay ? 1 : 0, // simplificado, cuenta plays anteriores
    };
  }

  /**
   * Calcula el resultado del quiz:
   * - Kahoot scoring: points * (0.5 + 0.5 * timeRatio)
   * - XP solo en el primer juego, multiplicado por xp_multiplier del config
   * - Actualiza xp_total y level del alumno si es primer juego
   */
  async submitQuiz(instanceId: string, studentProfileId: string, dto: SubmitQuizDto) {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Minijuego no encontrado.');

    const config = instance.config_json as any;
    const questions = instance.content_json as any[];

    const pointsCorrect: number = config?.points_correct ?? 100;
    const pointsWrong: number = config?.points_wrong ?? 0;
    const xpMultiplier: number = config?.xp_multiplier ?? 1;
    const maxXp: number = config?.max_xp ?? 500;

    // ¿Es el primer juego?
    const existingPlay = await this.resultRepo.findOne({
      where: { instance_id: instanceId, student_id: studentProfileId },
    });
    const isFirstPlay = !existingPlay;

    // Construir mapa de preguntas para lookup rápido
    // content_json uses 'question_id' as the key field
    const questionMap = new Map<string, any>(questions.map((q) => [q.question_id ?? q.id, q]));

    let totalScore = 0;
    let totalXp = 0;
    let correctCount = 0;
    const maxScore = questions.length * pointsCorrect;

    const processedAnswers = dto.answers.map((ans) => {
      const question = questionMap.get(ans.question_id);
      if (!question) return { ...ans, is_correct: false, points_earned: pointsWrong };

      const timeLimitMs = question.time_limit_ms ?? (question.time_seconds ?? config?.default_time_seconds ?? 30) * 1000;
      const isCorrect = ans.selected_option_id !== null && ans.selected_option_id === question.correct_option_id;

      let pointsEarned = isCorrect
        ? Math.round(pointsCorrect * (0.5 + 0.5 * Math.max(0, (timeLimitMs - ans.time_taken_ms) / timeLimitMs)))
        : pointsWrong;

      pointsEarned = Math.max(0, pointsEarned);

      if (isCorrect) {
        correctCount++;
        totalScore += pointsEarned;
        totalXp += question.xp_value ?? 10;
      }

      return {
        question_id: ans.question_id,
        selected_option_id: ans.selected_option_id,
        correct_option_id: question.correct_option_id,
        is_correct: isCorrect,
        time_taken_ms: ans.time_taken_ms,
        points_earned: pointsEarned,
      };
    });

    // XP con multiplicador y cap, solo primer juego
    const xpEarned = isFirstPlay ? Math.min(Math.round(totalXp * xpMultiplier), maxXp) : 0;

    // Guardar resultado
    const result = this.resultRepo.create({
      instance_id: instanceId,
      student_id: studentProfileId,
      score: totalScore,
      max_score: maxScore,
      xp_earned: xpEarned,
      correct_answers: correctCount,
      total_questions: questions.length,
      time_taken_seconds: dto.time_taken_seconds,
      answers: processedAnswers,
      content_snapshot: questions,
      is_first_play: isFirstPlay,
    });

    await this.resultRepo.save(result);

    // Actualizar XP y level del alumno si es primer juego
    if (isFirstPlay && xpEarned > 0) {
      const student = await this.studentRepo.findOne({ where: { id: studentProfileId } });
      if (student) {
        student.xp_total += xpEarned;
        student.level = Math.floor(student.xp_total / 100) + 1;
        await this.studentRepo.save(student);
        this.logger.log(`Alumno ${studentProfileId} ganó ${xpEarned} XP — nuevo total: ${student.xp_total} (lvl ${student.level})`);
      }
    }

    this.logger.log(`Quiz ${instanceId} completado por ${studentProfileId} — score: ${totalScore}/${maxScore}, xp: ${xpEarned}`);

    return {
      score: totalScore,
      max_score: maxScore,
      correct_answers: correctCount,
      total_questions: questions.length,
      xp_earned: xpEarned,
      is_first_play: isFirstPlay,
      time_taken_seconds: dto.time_taken_seconds,
      answers: processedAnswers,
    };
  }
}
