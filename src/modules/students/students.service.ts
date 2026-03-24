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

  async getProfileById(profileId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Perfil de alumno no encontrado.');
    return profile;
  }

  async addXp(profileId: string, xpToAdd: number): Promise<StudentProfile> {
    // Increment atómico en SQL: UPDATE ... SET xp_total = xp_total + N
    await this.studentRepo.increment({ id: profileId }, 'xp_total', xpToAdd);
    const profile = await this.getProfileById(profileId);
    profile.level = Math.floor(profile.xp_total / 100) + 1;
    return this.studentRepo.save(profile);
  }
}
