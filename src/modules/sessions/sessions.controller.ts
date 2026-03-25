import { Controller, Post, Patch, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { StartSessionDto } from './dto/start-session.dto';
import { MinigameEventDto } from './dto/minigame-event.dto';
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

@ApiTags('Sessions')
@ApiBearerAuth()
@Roles('student')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('start')
  @ApiOperation({
    summary: 'Iniciar una nueva sesión de estudio',
    description: 'Crea una sesión activa para el alumno. Opcionalmente asociada a un salón.',
  })
  @ApiBody({
    description: 'Datos de inicio de sesión (classroom_id opcional)',
    examples: {
      sin_clase: {
        summary: 'Sin clase asociada',
        value: {},
      },
      con_clase: {
        summary: 'Con clase asociada',
        value: { classroom_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Sesión creada. Retorna el objeto de sesión con started_at y events vacío.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (classroom_id con formato no UUID).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden iniciar sesiones.' })
  startSession(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartSessionDto,
  ) {
    return this.sessionsService.startSession(user.profile_id, dto);
  }

  @Patch(':id/end')
  @ApiOperation({
    summary: 'Finalizar una sesión activa',
    description: 'Marca la sesión como terminada estableciendo ended_at. Es idempotente: si ya estaba finalizada retorna la sesión sin cambios.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la sesión a finalizar' })
  @ApiResponse({ status: 200, description: 'Sesión finalizada. Retorna la sesión con ended_at seteado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de esta sesión.' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada.' })
  endSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessionsService.endSession(id, user.profile_id);
  }

  @Post('minigame-event')
  @ApiOperation({
    summary: 'Registrar el resultado de un minijuego dentro de una sesión',
    description: 'Agrega un evento de minijuego a la sesión activa. Calcula y acumula XP si el alumno completó el minijuego. No permite registrar el mismo minijuego dos veces en la misma sesión.',
  })
  @ApiBody({
    description: 'Resultado del minijuego a registrar',
    examples: {
      completado: {
        summary: 'Minijuego completado con buen puntaje',
        value: {
          session_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          minigame_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          score: 850,
          max_score: 1000,
          completed: true,
        },
      },
      incompleto: {
        summary: 'Minijuego no completado',
        value: {
          session_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          minigame_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          score: 200,
          max_score: 1000,
          completed: false,
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Evento registrado. Retorna la sesión actualizada con el nuevo evento y XP ganado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (campos faltantes o tipos incorrectos).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de esta sesión o la sesión ya fue finalizada.' })
  @ApiResponse({ status: 404, description: 'Sesión o minijuego no encontrado.' })
  @ApiResponse({ status: 409, description: 'Este minijuego ya fue registrado en esta sesión.' })
  addMinigameEvent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MinigameEventDto,
  ) {
    return this.sessionsService.addMinigameEvent(user.profile_id, dto);
  }
}
