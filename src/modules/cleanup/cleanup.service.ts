import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private dataSource: DataSource) {}

  // Hard delete de minigames soft-deleted hace más de 7 días (y sus instancias/asignaciones)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async hardDeleteMinigames() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Primero borrar asignaciones de instancias huérfanas
    await this.dataSource.query(
      `DELETE FROM minigame_instance_assignments
       WHERE instance_id IN (
         SELECT id FROM minigame_instances WHERE deleted_at IS NOT NULL AND deleted_at < $1
       )`,
      [cutoff],
    );

    // Borrar instancias
    await this.dataSource.query(
      `DELETE FROM minigame_instances WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
      [cutoff],
    );

    // Borrar templates
    const result = await this.dataSource.query(
      `DELETE FROM minigames WHERE deleted_at IS NOT NULL AND deleted_at < $1 RETURNING slug`,
      [cutoff],
    );

    if (result.length > 0) {
      this.logger.log(`Hard deleted ${result.length} minigames: ${result.map((r: any) => r.slug).join(', ')}`);
    }
  }

  // Hard delete de lesson_progress soft-deleted hace más de 30 días
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async hardDeleteLessonProgress() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.dataSource.query(
      `DELETE FROM lesson_progress WHERE deleted_at IS NOT NULL AND deleted_at < $1 RETURNING id`,
      [cutoff],
    );

    if (result.length > 0) {
      this.logger.log(`Hard deleted ${result.length} lesson_progress records`);
    }
  }
}
