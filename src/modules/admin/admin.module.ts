import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/entities/user.entity';
import { Minigame } from '../minigames/entities/minigame.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Minigame])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
