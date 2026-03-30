import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MinigameInstance } from './entities/minigame-instance.entity';
import { MinigameInstanceAssignment } from './entities/minigame-instance-assignment.entity';
import { MinigameResult } from './entities/minigame-result.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { MinigameInstancesController } from './minigame-instances.controller';
import { MinigameInstancesService } from './minigame-instances.service';
import { AIService } from './ai.service';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      MinigameInstance,
      MinigameInstanceAssignment,
      MinigameResult,
      Minigame,
      Classroom,
      ClassroomStudent,
      StudentProfile,
    ]),
    TeachersModule,
  ],
  controllers: [MinigameInstancesController],
  providers: [MinigameInstancesService, AIService],
})
export class MinigameInstancesModule {}
