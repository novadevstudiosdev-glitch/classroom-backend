import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClassroomsController } from './classrooms.controller';
import { ClassroomsService } from './classrooms.service';
import { Classroom } from './entities/classroom.entity';
import { ClassroomStudent } from './entities/classroom-student.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Classroom, ClassroomStudent, TeacherProfile])],
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [ClassroomsService], // lo necesitarán lessons y progress
})
export class ClassroomsModule {}
