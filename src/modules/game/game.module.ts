import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GameGateway } from './game.gateway';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';
import { User } from '../users/entities/user.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { ParentProfile } from '../parents/entities/parent-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MinigameInstance,
      User,
      TeacherProfile,
      StudentProfile,
      ParentProfile,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [GameGateway],
})
export class GameModule {}
