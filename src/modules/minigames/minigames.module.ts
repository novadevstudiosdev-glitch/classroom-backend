import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Minigame } from './entities/minigame.entity';
import { MinigamesController } from './minigames.controller';
import { MinigamesService } from './minigames.service';

@Module({
  imports: [TypeOrmModule.forFeature([Minigame])],
  controllers: [MinigamesController],
  providers: [MinigamesService],
  exports: [MinigamesService],
})
export class MinigamesModule {}
