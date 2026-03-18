import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { Lesson } from './entities/lesson.entity';
import { LessonAssignment } from './entities/lesson-assignment.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lesson, LessonAssignment, TeacherProfile, Classroom]),
  ],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
