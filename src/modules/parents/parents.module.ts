import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentProfile } from './entities/parent-profile.entity';
import { ParentStudent } from './entities/parent-student.entity';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParentProfile, ParentStudent])],
  controllers: [ParentsController],
  providers: [ParentsService],
  exports: [ParentsService],
})
export class ParentsModule {}
