import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherProfile } from './entities/teacher-profile.entity';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(TeacherProfile)
    private teacherRepo: Repository<TeacherProfile>,
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
}
