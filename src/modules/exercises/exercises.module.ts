import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from './entities/exercise.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { ExerciseCorrectorService } from './answer/exercise-corrector.service';

@Module({
  imports: [TypeOrmModule.forFeature([Exercise, Lesson, TeacherProfile])],
  controllers: [ExercisesController],
  providers: [ExercisesService, ExerciseCorrectorService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
