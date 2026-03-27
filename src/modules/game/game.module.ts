import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameGateway } from './game.gateway';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MinigameInstance])],
  providers: [GameGateway],
})
export class GameModule {}
