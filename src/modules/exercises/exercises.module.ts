import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { ExerciseCorrectorService } from './answer/exercise-corrector.service';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [TypeOrmModule.forFeature([Exercise, Lesson]), TeachersModule],
  controllers: [ExercisesController],
  providers: [ExercisesService, ExerciseCorrectorService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
