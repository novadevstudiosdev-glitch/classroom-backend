import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentProfile } from './entities/student-profile.entity';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,
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
}
