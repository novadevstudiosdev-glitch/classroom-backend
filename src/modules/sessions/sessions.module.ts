import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Minigame } from '../minigames/entities/minigame.entity';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Minigame, MinigameInstance])],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
