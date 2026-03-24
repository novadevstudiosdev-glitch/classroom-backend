import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Exercise } from './entities/exercise.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { CreateExerciseDto, CONFIG_SCHEMA_MAP } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ExerciseCorrectorService } from './answer/exercise-corrector.service';
import { AnswerExerciseDto } from './dto/answer-exercise.dto';

@Injectable()
export class ExercisesService {
  private readonly logger = new Logger(ExercisesService.name);

  constructor(
    @InjectRepository(Exercise)
    private exerciseRepo: Repository<Exercise>,

    @InjectRepository(Lesson)
    private lessonRepo: Repository<Lesson>,

    @InjectRepository(TeacherProfile)
    private teacherRepo: Repository<TeacherProfile>,

    private correctorService: ExerciseCorrectorService,
  ) {}

  private async getTeacherId(userId: string): Promise<string> {
    const profile = await this.teacherRepo.findOne({ where: { user_id: userId } });
    if (!profile) throw new ForbiddenException('Solo los docentes pueden gestionar ejercicios.');
    return profile.id;
  }

  private validateConfigJson(type: Exercise['type'], config_json: Record<string, any>): void {
    const DtoClass = CONFIG_SCHEMA_MAP[type];
    if (!DtoClass) throw new BadRequestException(`Tipo de ejercicio inválido: ${type}`);

    const instance = plainToInstance(DtoClass, config_json);
    const errors = validateSync(instance as object, { whitelist: true });

    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(`config_json inválido para tipo "${type}": ${messages.join(', ')}`);
    }
  }

  async create(userId: string, dto: CreateExerciseDto): Promise<Exercise> {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = await this.lessonRepo.findOne({
      where: { id: dto.lesson_id, teacher_id },
    });
    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    // FIX: validar config_json antes de guardar
    this.validateConfigJson(dto.type, dto.config_json);

    const exercise = this.exerciseRepo.create({
      lesson_id: dto.lesson_id,
      type: dto.type,
      title: dto.title,
      order: dto.order ?? 0,
      content_json: dto.config_json,
    });

    await this.exerciseRepo.save(exercise);
    this.logger.log(`Ejercicio creado: ${exercise.id} en lección ${dto.lesson_id}`);

    return exercise;
  }

  async findOne(userId: string, exerciseId: string): Promise<Exercise> {
    const teacher_id = await this.getTeacherId(userId);

    const exercise = await this.exerciseRepo.createQueryBuilder('exercise').innerJoin('exercise.lesson', 'lesson').where('exercise.id = :exerciseId', { exerciseId }).andWhere('lesson.teacher_id = :teacher_id', { teacher_id }).getOne();

    if (!exercise) throw new NotFoundException('Ejercicio no encontrado.');

    return exercise;
  }

  async update(userId: string, exerciseId: string, dto: UpdateExerciseDto): Promise<Exercise> {
    const teacher_id = await this.getTeacherId(userId);

    const exercise = await this.exerciseRepo.createQueryBuilder('exercise').innerJoin('exercise.lesson', 'lesson').where('exercise.id = :exerciseId', { exerciseId }).andWhere('lesson.teacher_id = :teacher_id', { teacher_id }).getOne();

    if (!exercise) throw new NotFoundException('Ejercicio no encontrado.');

    // If config_json is being updated without a new type, validate against existing type
    if (dto.config_json && !dto.type) {
      this.validateConfigJson(exercise.type, dto.config_json);
    }

    if (dto.title !== undefined) exercise.title = dto.title;
    if (dto.order !== undefined) exercise.order = dto.order;
    if (dto.type !== undefined) exercise.type = dto.type;
    if (dto.config_json !== undefined) exercise.content_json = dto.config_json;

    await this.exerciseRepo.save(exercise);
    this.logger.log(`Ejercicio actualizado: ${exerciseId}`);

    return exercise;
  }

  async remove(userId: string, exerciseId: string): Promise<{ message: string }> {
    const teacher_id = await this.getTeacherId(userId);

    const exercise = await this.exerciseRepo.createQueryBuilder('exercise').innerJoin('exercise.lesson', 'lesson').where('exercise.id = :exerciseId', { exerciseId }).andWhere('lesson.teacher_id = :teacher_id', { teacher_id }).getOne();

    if (!exercise) throw new NotFoundException('Ejercicio no encontrado.');

    await this.exerciseRepo.remove(exercise);
    this.logger.log(`Ejercicio eliminado: ${exerciseId}`);

    return { message: 'Ejercicio eliminado correctamente.' };
  }

  async answerExercise(exerciseId: string, dto: AnswerExerciseDto) {
    // Nota: este endpoint es para alumnos, no valida teacher ownership.
    // El alumno solo necesita que el ejercicio exista y esté en una lección publicada.
    const exercise = await this.exerciseRepo.findOne({
      where: { id: exerciseId },
      relations: ['lesson'],
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado.');
    }

    if (exercise.lesson?.status !== 'published') {
      throw new BadRequestException('Este ejercicio no está disponible todavía.');
    }

    const result = this.correctorService.correct(exercise.type, exercise.content_json, dto.answer);

    this.logger.log(`Ejercicio ${exerciseId} respondido — correcto: ${result.is_correct}`);

    return result;
  }
}
