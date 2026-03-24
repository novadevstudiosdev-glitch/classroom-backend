import { Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { CompleteLessonDto } from './dto/complete-lesson.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Progress')
@ApiBearerAuth()
@Roles('student')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Obtener mi progreso en todas las lecciones',
    description: 'Retorna todos los registros de progreso del alumno autenticado, ordenados por fecha de actualización.',
  })
  @ApiResponse({ status: 200, description: 'Array de progresos con status, estrellas, XP y fechas.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden consultar su progreso.' })
  getMyProgress(@CurrentUser() user: JwtPayload) {
    return this.progressService.getMyProgress(user.profile_id);
  }

  @Post('lessons/:lessonId/start')
  @ApiOperation({
    summary: 'Iniciar o reanudar el progreso de una lección',
    description: 'Si el progreso ya existe, lo retorna sin modificarlo (idempotente). La lección debe estar en estado published.',
  })
  @ApiParam({ name: 'lessonId', description: 'UUID de la lección a iniciar' })
  @ApiResponse({ status: 201, description: 'Progreso iniciado (status: in_progress) o retorna el progreso existente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden iniciar lecciones.' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada o no está publicada.' })
  startLesson(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ) {
    return this.progressService.startLesson(user.profile_id, lessonId);
  }

  @Patch('lessons/:lessonId/complete')
  @ApiOperation({
    summary: 'Marcar la lección como completada y calcular estrellas + XP',
    description: 'Calcula estrellas según el score: ≥90% → 3 estrellas (30 XP), ≥60% → 2 estrellas (20 XP), <60% → 1 estrella (10 XP). Es idempotente: si ya estaba completada no suma XP nuevamente.',
  })
  @ApiParam({ name: 'lessonId', description: 'UUID de la lección a completar' })
  @ApiBody({
    description: 'Puntaje final obtenido en la lección (0-100)',
    examples: {
      tres_estrellas: {
        summary: '3 estrellas — ≥90%',
        value: { score_pct: 95 },
      },
      dos_estrellas: {
        summary: '2 estrellas — 60–89%',
        value: { score_pct: 75 },
      },
      una_estrella: {
        summary: '1 estrella — <60%',
        value: { score_pct: 45 },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Lección completada. Retorna el progreso con stars, xp_earned y completed_at.' })
  @ApiResponse({ status: 400, description: 'score_pct inválido (fuera del rango 0-100 o campo faltante).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden completar lecciones.' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada.' })
  completeLesson(
    @CurrentUser() user: JwtPayload,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progressService.completeLesson(user.profile_id, lessonId, dto);
  }
}
