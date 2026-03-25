import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MinigameInstance } from './entities/minigame-instance.entity';
import { MinigameInstanceAssignment } from './entities/minigame-instance-assignment.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { TeachersService } from '../teachers/teachers.service';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';
import { CreateMinigameInstanceDto } from './dto/create-minigame-instance.dto';
import { UpdateMinigameInstanceDto } from './dto/update-minigame-instance.dto';
import { AssignMinigameInstanceDto } from './dto/assign-minigame-instance.dto';

@Injectable()
export class MinigameInstancesService {
  constructor(
    @InjectRepository(MinigameInstance)
    private instanceRepo: Repository<MinigameInstance>,

    @InjectRepository(MinigameInstanceAssignment)
    private assignmentRepo: Repository<MinigameInstanceAssignment>,

    @InjectRepository(Minigame)
    private minigameRepo: Repository<Minigame>,

    private teachersService: TeachersService,

    @InjectRepository(Classroom)
    private classroomRepo: Repository<Classroom>,

    @InjectRepository(ClassroomStudent)
    private classroomStudentRepo: Repository<ClassroomStudent>,
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
    });
  }

  async findAllPublic(): Promise<MinigameInstance[]> {
    return this.instanceRepo.find({
      where: { is_public: true },
      order: { updated_at: 'DESC' },
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
}
