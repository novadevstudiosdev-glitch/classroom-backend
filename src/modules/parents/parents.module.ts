import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';
import { ReportsService } from './reports.service';
import { ParentProfile } from './entities/parent-profile.entity';
import { ParentStudent } from './entities/parent-student.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { LessonProgress } from '../progress/entities/lesson-progress.entity';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ParentProfile, ParentStudent, StudentProfile, LessonProgress, Session, User])],
  controllers: [ParentsController],
  providers: [ParentsService, ReportsService],
  exports: [ParentsService, ReportsService],
})
export class ParentsModule {}
