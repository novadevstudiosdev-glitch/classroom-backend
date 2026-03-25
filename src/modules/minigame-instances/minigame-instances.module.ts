import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MinigameInstance } from './entities/minigame-instance.entity';
import { MinigameInstanceAssignment } from './entities/minigame-instance-assignment.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';
import { MinigameInstancesController } from './minigame-instances.controller';
import { MinigameInstancesService } from './minigame-instances.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MinigameInstance,
      MinigameInstanceAssignment,
      Minigame,
      TeacherProfile,
      Classroom,
      ClassroomStudent,
    ]),
  ],
  controllers: [MinigameInstancesController],
  providers: [MinigameInstancesService],
})
export class MinigameInstancesModule {}
