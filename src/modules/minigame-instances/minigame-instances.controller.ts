import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { MinigameInstancesService } from './minigame-instances.service';
import { AIService, GenerateGameDto } from './ai.service';
import { CreateMinigameInstanceDto } from './dto/create-minigame-instance.dto';
import { UpdateMinigameInstanceDto } from './dto/update-minigame-instance.dto';
import { AssignMinigameInstanceDto } from './dto/assign-minigame-instance.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Minigame Instances')
@ApiBearerAuth()
@Controller('minigame-instances')
export class MinigameInstancesController {
  constructor(
    private readonly service: MinigameInstancesService,
    private readonly gemini: AIService,
  ) {}

  // ─── DOCENTE ────────────────────────────────────────────────────────────────

  @Post()
  @Roles('teacher')
  @ApiOperation({
    summary: 'Crear un minijuego con contenido propio',
    description: 'El docente elige un template de minijuego (de /minigames) y crea una instancia con su propio contenido (preguntas, pares, palabras, etc.).',
  })
  @ApiBody({
    description: 'Datos del minijuego a crear',
    examples: {
      word_runner: {
        summary: 'Word Runner — palabras de animales',
        value: {
          minigame_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          title: 'Animales de la selva',
          description: 'Practica los animales en inglés',
          content_json: [
            { word: 'elephant', translation: 'elefante', correct: true },
            { word: 'tiger', translation: 'tigre', correct: true },
          ],
          config_json: { theme: 'jungle', timer: 60, lives: 3 },
        },
      },
      quiz_rush: {
        summary: 'Quiz Rush — preguntas de geografía',
        value: {
          minigame_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          title: 'Capitales de América',
          content_json: [
            { question: '¿Capital de Argentina?', answer: 'Buenos Aires', options: ['Lima', 'Santiago', 'Buenos Aires', 'Bogotá'] },
            { question: '¿Capital de Brasil?', answer: 'Brasilia', options: ['São Paulo', 'Brasilia', 'Rio de Janeiro', 'Manaus'] },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Instancia creada (privada por defecto). Retorna el objeto completo con id.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (campos requeridos faltantes).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los docentes pueden crear instancias.' })
  @ApiResponse({ status: 404, description: 'Template de minijuego no encontrado o inactivo.' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMinigameInstanceDto) {
    return this.service.create(user.sub, dto);
  }

  @Get()
  @Roles('teacher')
  @ApiOperation({
    summary: 'Listar mis minijuegos',
    description: 'Retorna todas las instancias creadas por el docente autenticado, ordenadas por fecha de actualización.',
  })
  @ApiResponse({ status: 200, description: 'Array de instancias del docente con título, visibilidad y fecha.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los docentes pueden listar sus instancias.' })
  findAllOwn(@CurrentUser() user: JwtPayload) {
    return this.service.findAllOwn(user.sub);
  }

  @Get('explore')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Explorar minijuegos públicos de otros docentes',
    description: 'Retorna todas las instancias marcadas como públicas. Los docentes pueden clonarlas.',
  })
  @ApiResponse({ status: 200, description: 'Array de instancias públicas de toda la plataforma.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los docentes pueden explorar instancias.' })
  findAllPublic() {
    return this.service.findAllPublic();
  }

  @Get(':id')
  @Roles('teacher', 'student')
  @ApiOperation({
    summary: 'Ver detalle de un minijuego',
    description: 'Los docentes ven sus propios minijuegos o los públicos. Los alumnos solo pueden ver los que están asignados a su clase.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiResponse({ status: 200, description: 'Datos completos de la instancia con content_json y config_json.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés acceso a este minijuego (privado de otro docente).' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(id, user.sub, user.role);
  }

  @Patch(':id')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Editar un minijuego propio',
    description: 'Actualiza título, descripción, content_json o config_json. Solo el docente dueño puede editar.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiBody({
    description: 'Campos a actualizar (todos opcionales)',
    examples: {
      actualizar_titulo: {
        summary: 'Solo cambiar título',
        value: { title: 'Nuevo título' },
      },
      actualizar_contenido: {
        summary: 'Actualizar preguntas',
        value: {
          title: 'Animales del océano',
          content_json: [
            { question: '¿Cuál es el animal más grande del océano?', answer: 'Ballena azul', options: ['Tiburón', 'Ballena azul', 'Pulpo', 'Delfín'] },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Instancia actualizada.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este minijuego.' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMinigameInstanceDto,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Roles('teacher')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un minijuego propio',
    description: 'Soft delete — el minijuego deja de estar disponible pero el historial de sesiones se mantiene.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiResponse({ status: 204, description: 'Instancia eliminada (sin body en la respuesta).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este minijuego.' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(id, user.sub);
  }

  @Post(':id/assign')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Asignar minijuego a una clase',
    description: 'Los alumnos de esa clase podrán ver y jugar el minijuego. Solo el docente dueño puede asignar.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiBody({ type: AssignMinigameInstanceDto })
  @ApiResponse({ status: 201, description: 'Asignación creada. Retorna el registro de asignación.' })
  @ApiResponse({ status: 400, description: 'classroom_id inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este minijuego o la clase no te pertenece.' })
  @ApiResponse({ status: 404, description: 'Instancia o clase no encontrada.' })
  @ApiResponse({ status: 409, description: 'Este minijuego ya está asignado a esa clase.' })
  assign(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignMinigameInstanceDto,
  ) {
    return this.service.assign(id, user.sub, dto);
  }

  @Delete(':id/assign/:classroomId')
  @Roles('teacher')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desasignar minijuego de una clase',
    description: 'Los alumnos de esa clase dejarán de ver el minijuego. Solo el docente dueño puede desasignar.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiParam({ name: 'classroomId', description: 'UUID de la clase' })
  @ApiResponse({ status: 204, description: 'Asignación eliminada (sin body en la respuesta).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este minijuego.' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  unassign(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
  ) {
    return this.service.unassign(id, classroomId, user.sub);
  }

  @Patch(':id/publish')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Hacer público o privado un minijuego',
    description: 'Toggle: si estaba privado lo hace público (visible en /explore), y viceversa. Solo el docente dueño puede cambiar la visibilidad.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiResponse({ status: 200, description: 'Visibilidad actualizada. Retorna la instancia con el nuevo valor de is_public.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este minijuego.' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  togglePublic(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.togglePublic(id, user.sub);
  }

  @Post(':id/clone')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Clonar un minijuego público a mi cuenta',
    description: 'Crea una copia privada del minijuego en la cuenta del docente. Solo se pueden clonar minijuegos públicos o los propios.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego a clonar' })
  @ApiResponse({ status: 201, description: 'Clon creado (privado, con título "Copia de [original]"). Retorna la nueva instancia.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo podés clonar minijuegos públicos o propios.' })
  @ApiResponse({ status: 404, description: 'Instancia no encontrada.' })
  clone(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.clone(id, user.sub);
  }

  // ─── ALUMNO ─────────────────────────────────────────────────────────────────

  @Get(':id/play')
  @Roles('student')
  @ApiOperation({
    summary: 'Obtener el quiz para jugar',
    description: 'Retorna las preguntas SIN correct_option_id. Indica si es el primer juego del alumno.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiResponse({ status: 200, description: 'Preguntas y configuración del quiz, listas para jugar.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden usar este endpoint.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  getForPlay(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getForPlay(id, user.profile_id);
  }

  @Post(':id/submit')
  @Roles('student')
  @ApiOperation({
    summary: 'Enviar respuestas del quiz',
    description: 'Calcula el puntaje usando fórmula Kahoot (speed bonus). Solo el primer juego otorga XP y cuenta como nota oficial.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiBody({ type: SubmitQuizDto })
  @ApiResponse({ status: 201, description: 'Resultado calculado y guardado. Retorna score, XP, respuestas con corrección.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los alumnos pueden usar este endpoint.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  submitQuiz(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.service.submitQuiz(id, user.profile_id, dto);
  }

  @Get('by-classroom/:classroomId')
  @Roles('student')
  @ApiOperation({
    summary: 'Ver minijuegos disponibles en mi clase',
    description: 'Retorna los minijuegos asignados a la clase. El alumno debe pertenecer a esa clase.',
  })
  @ApiParam({ name: 'classroomId', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Array de instancias de minijuego asignadas a la clase.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No pertenecés a esta clase.' })
  findByClassroom(
    @CurrentUser() user: JwtPayload,
    @Param('classroomId', ParseUUIDPipe) classroomId: string,
  ) {
    return this.service.findByClassroom(classroomId, user.profile_id);
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  @Post('generate-ai')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Generar preguntas de quiz con IA (público, lobby)',
    description: 'No requiere autenticación. Límite: 5 requests por minuto por IP. Usa Gemini para generar preguntas según el tema, cantidad y dificultad indicados.',
  })
  @ApiBody({
    description: 'Parámetros para la generación con IA',
    schema: {
      type: 'object',
      required: ['topic', 'questionCount', 'gameType'],
      properties: {
        topic: { type: 'string', example: 'Segunda Guerra Mundial' },
        questionCount: { type: 'number', example: 10 },
        gameType: { type: 'string', enum: ['quiz', 'wordsearch', 'anagram'], example: 'quiz' },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], example: 'medium' },
        language: { type: 'string', example: 'es' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Preguntas generadas. Retorna array de preguntas con opciones y respuesta correcta.' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos (topic vacío, cantidad fuera de rango, etc.).' })
  @ApiResponse({ status: 429, description: 'Límite de rate excedido — 5 requests/min.' })
  @ApiResponse({ status: 500, description: 'Error del proveedor de IA (Gemini no disponible).' })
  generateAI(@Body() dto: GenerateGameDto) {
    return this.gemini.generateGame(dto);
  }

  @Post('generate-ai/save')
  @Public()
  @ApiOperation({
    summary: 'Guardar juego generado por IA (público, lobby)',
    description: 'Persiste el juego generado por IA como instancia de minijuego. No requiere autenticación — el juego queda asociado a un teacher_id genérico del lobby.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'content_json'],
      properties: {
        title: { type: 'string', example: 'Capitales de Europa' },
        topic: { type: 'string', example: 'geografía europea' },
        content_json: {
          type: 'array',
          description: 'Array de preguntas con opciones generadas por IA',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              correct: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Juego guardado. Retorna la instancia creada con su id.' })
  @ApiResponse({ status: 400, description: 'content_json faltante o title vacío.' })
  async saveAIGame(@Body() body: { title: string; topic: string; content_json: any }) {
    if (!body?.content_json) throw new BadRequestException('content_json requerido.');
    return this.gemini.saveGeneratedGame(body.title, body.topic, body.content_json);
  }

  @Delete(':id/force')
  @Roles('teacher', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar juego permanentemente (hard delete)',
    description: 'Solo el docente dueño o un admin pueden usar este endpoint. A diferencia del DELETE /:id (soft delete), este elimina el registro definitivamente.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la instancia de minijuego' })
  @ApiResponse({ status: 204, description: 'Juego eliminado permanentemente (sin body).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No sos el dueño de este juego (solo admin puede saltear esta restricción).' })
  @ApiResponse({ status: 404, description: 'Juego no encontrado.' })
  async forceDelete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.forceDeleteOwn(id, user.sub, user.role);
  }
}
