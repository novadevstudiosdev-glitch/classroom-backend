import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LessonProgress } from './entities/lesson-progress.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CompleteLessonDto } from './dto/complete-lesson.dto';

function calculateStars(scorePct: number): number {
  if (scorePct >= 90) return 3;
  if (scorePct >= 60) return 2;
  return 1;
}

function calculateXp(stars: number): number {
  return stars * 10; // 10, 20 o 30 XP
}

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(LessonProgress)
    private progressRepo: Repository<LessonProgress>,
    @InjectRepository(Lesson)
    private lessonRepo: Repository<Lesson>,
    private dataSource: DataSource,
  ) {}

  async startLesson(studentProfileId: string, lessonId: string): Promise<LessonProgress> {
    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId, status: 'published' },
    });
    if (!lesson) throw new NotFoundException('Lección no encontrada o no publicada.');

    const existing = await this.progressRepo.findOne({
      where: { student_id: studentProfileId, lesson_id: lessonId },
    });

    if (existing) return existing;

    const progress = this.progressRepo.create({
      student_id: studentProfileId,
      lesson_id: lessonId,
      status: 'in_progress',
    });

    return this.progressRepo.save(progress);
  }

  async completeLesson(
    studentProfileId: string,
    lessonId: string,
    dto: CompleteLessonDto,
  ): Promise<LessonProgress> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lección no encontrada.');

    return this.dataSource.transaction(async (manager) => {
      let progress = await manager.findOne(LessonProgress, {
        where: { student_id: studentProfileId, lesson_id: lessonId },
      });

      if (!progress) {
        progress = manager.create(LessonProgress, {
          student_id: studentProfileId,
          lesson_id: lessonId,
          status: 'in_progress',
        });
      }

      // Idempotente: si ya estaba completada no se suma XP de nuevo
      if (progress.status === 'completed') return progress;

      const stars = calculateStars(dto.score_pct);
      const xpEarned = calculateXp(stars);

      progress.status = 'completed';
      progress.score_pct = dto.score_pct;
      progress.stars = stars;
      progress.xp_earned = xpEarned;
      progress.completed_at = new Date();

      await manager.save(LessonProgress, progress);

      // Incremento atómico de XP dentro de la transacción
      await manager.increment(StudentProfile, { id: studentProfileId }, 'xp_total', xpEarned);
      const updatedProfile = await manager.findOne(StudentProfile, {
        where: { id: studentProfileId },
      });
      if (updatedProfile) {
        updatedProfile.level = Math.floor(updatedProfile.xp_total / 100) + 1;
        await manager.save(StudentProfile, updatedProfile);
      }

      return progress;
    });
  }

  async getMyProgress(studentProfileId: string): Promise<LessonProgress[]> {
    return this.progressRepo.find({
      where: { student_id: studentProfileId },
      order: { updated_at: 'DESC' },
      take: 500,
    });
  }
}
