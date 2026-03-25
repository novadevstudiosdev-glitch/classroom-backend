import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MinigameInstance } from './entities/minigame-instance.entity';
import { MinigameInstanceAssignment } from './entities/minigame-instance-assignment.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';
import { MinigameInstancesController } from './minigame-instances.controller';
import { MinigameInstancesService } from './minigame-instances.service';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MinigameInstance,
      MinigameInstanceAssignment,
      Minigame,
      Classroom,
      ClassroomStudent,
    ]),
    TeachersModule,
  ],
  controllers: [MinigameInstancesController],
  providers: [MinigameInstancesService],
})
export class MinigameInstancesModule {}
