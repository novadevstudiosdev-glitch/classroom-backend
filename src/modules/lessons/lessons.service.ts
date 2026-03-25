import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from './entities/lesson.entity';
import { LessonAssignment } from './entities/lesson-assignment.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { TeachersService } from '../teachers/teachers.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { AssignLessonDto } from './dto/assign-lesson.dto';
import { ListLessonsDto } from './dto/list-lessons.dto';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    @InjectRepository(Lesson)
    private lessonRepo: Repository<Lesson>,

    @InjectRepository(LessonAssignment)
    private assignmentRepo: Repository<LessonAssignment>,

    private teachersService: TeachersService,

    @InjectRepository(Classroom)
    private classroomRepo: Repository<Classroom>,
  ) {}

  private async getTeacherId(userId: string): Promise<string> {
    const profile = await this.teachersService.getProfileOrFail(userId);
    return profile.id;
  }

  async create(userId: string, dto: CreateLessonDto) {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = this.lessonRepo.create({
      teacher_id,
      title: dto.title,
      description: dto.description,
      content_json: dto.content_json ?? {},
      status: 'draft',
    });

    await this.lessonRepo.save(lesson);
    this.logger.log(`Lección creada: ${lesson.id} por docente ${teacher_id}`);

    return lesson;
  }

  async findAll(userId: string, query: ListLessonsDto) {
    const teacher_id = await this.getTeacherId(userId);
    const { status, page = 1, limit = 20 } = query;

    const qb = this.lessonRepo
      .createQueryBuilder('lesson')
      .where('lesson.teacher_id = :teacher_id', { teacher_id })
      .andWhere('lesson.deleted_at IS NULL')
      .orderBy('lesson.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      qb.andWhere('lesson.status = :status', { status });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, lessonId: string) {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId, teacher_id },
      relations: ['exercises'],
      order: { exercises: { order: 'ASC' } },
    });

    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    return lesson;
  }

  async update(userId: string, lessonId: string, dto: UpdateLessonDto) {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId, teacher_id },
    });

    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    Object.assign(lesson, dto);
    await this.lessonRepo.save(lesson);

    this.logger.log(`Lección actualizada: ${lessonId}`);
    return lesson;
  }

  async remove(userId: string, lessonId: string) {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId, teacher_id },
      relations: ['assignments'],
    });

    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    if (lesson.assignments && lesson.assignments.length > 0) {
      throw new ForbiddenException(
        'No podés eliminar una lección que ya fue asignada a una clase.',
      );
    }

    await this.lessonRepo.softDelete(lessonId);
    this.logger.log(`Lección eliminada (soft): ${lessonId}`);

    return { message: 'Lección eliminada correctamente.' };
  }

  async assign(userId: string, lessonId: string, dto: AssignLessonDto) {
    const teacher_id = await this.getTeacherId(userId);

    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId, teacher_id },
    });

    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    if (lesson.status !== 'published') {
      throw new ForbiddenException('Solo podés asignar lecciones publicadas.');
    }

    const classroom = await this.classroomRepo.findOne({
      where: { id: dto.classroom_id, teacher_id, is_archived: false },
    });

    if (!classroom) throw new NotFoundException('Clase no encontrada.');

    const assignment = this.assignmentRepo.create({
      lesson_id: lessonId,
      classroom_id: dto.classroom_id,
      due_date: dto.due_date ? new Date(dto.due_date) : null,
    });

    await this.assignmentRepo.save(assignment);
    this.logger.log(`Lección ${lessonId} asignada a clase ${dto.classroom_id}`);

    return assignment;
  }
}
