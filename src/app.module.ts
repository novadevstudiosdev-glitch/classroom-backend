import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassroomsModule } from './modules/classrooms/classrooms.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { MinigamesModule } from './modules/minigames/minigames.module';
import { ParentsModule } from './modules/parents/parents.module';
import { ProgressModule } from './modules/progress/progress.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StudentsModule } from './modules/students/students.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
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
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

