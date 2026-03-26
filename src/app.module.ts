import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { RolesGuard } from './common/guards/roles.guard';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { MinigamesModule } from './modules/minigames/minigames.module';
import { MinigameInstancesModule } from './modules/minigame-instances/minigame-instances.module';
import { ParentsModule } from './modules/parents/parents.module';
import { ProgressModule } from './modules/progress/progress.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StudentsModule } from './modules/students/students.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { UsersModule } from './modules/users/users.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [configuration],
      validationSchema: envValidationSchema,
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true, ignore: 'pid,hostname' } }
          : undefined,
        autoLogging: false, // no loguear cada HTTP request automáticamente (lo hacemos a mano)
      },
    }),

    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),

    ScheduleModule.forRoot(),

    // Rate limiting global: 100 requests / minuto por IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minuto en ms
        limit: 100,
      },
    ]),

    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TeachersModule,
    StudentsModule,
    ParentsModule,
    ClassroomsModule,
    LessonsModule,
    ExercisesModule,
    ProgressModule,
    SessionsModule,
    MinigamesModule,
    MinigameInstancesModule,
    AdminModule,
    NotificationsModule,
    CleanupModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },  // autentica antes que RolesGuard
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
