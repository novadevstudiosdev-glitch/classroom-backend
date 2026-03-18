import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentProfile } from './entities/parent-profile.entity';
import { ParentStudent } from './entities/parent-student.entity';

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(ParentProfile)
    private parentRepo: Repository<ParentProfile>,

    @InjectRepository(ParentStudent)
    private parentStudentRepo: Repository<ParentStudent>,
  ) {}

  async getProfile(userId: string): Promise<ParentProfile & { students: ParentStudent[] }> {
    const profile = await this.parentRepo.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de padre/tutor no encontrado.');
    }

    const students = await this.parentStudentRepo.find({
      where: { parent_id: profile.id, is_confirmed: true },
    });

    return { ...profile, students };
  }
}
