import { Controller, Get, Post, Delete, Patch, Body, Param, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateNoteDto {
  @ApiProperty({ example: 'Tiene que mejorar la escritura. Faltó el martes.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}

@ApiTags('Teachers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('teacher')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del docente autenticado' })
  @ApiResponse({ status: 200, description: 'Retorna los datos del perfil del docente (first_name, last_name, country, etc.).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  async getMe(@CurrentUser() user: any) {
    return this.teachersService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar perfil del docente autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado. Retorna los datos actualizados.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.updateProfile(user.sub, dto);
  }

  // ─────────────────────────────────────────────────
  // ESTADÍSTICAS GLOBALES DE ALUMNOS
  // ─────────────────────────────────────────────────

  @Get('me/students/stats')
  @ApiOperation({
    summary: 'Estadísticas globales de alumnos del docente',
    description: 'Total de alumnos únicos entre todas las clases activas, cuántos estuvieron activos en los últimos 30 días, cuántos están atrasados (lección vencida sin completar) y cuántos tienen baja participación (promedio < 50%).',
  })
  @ApiResponse({ status: 200, description: '{ total, active, behind, low_participation }' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  getStudentStats(@CurrentUser() user: any) {
    return this.teachersService.getStudentStats(user.sub);
  }

  // ─────────────────────────────────────────────────
  // NOTAS SOBRE ALUMNOS
  // ─────────────────────────────────────────────────

  @Get('me/students/:studentId/notes')
  @ApiOperation({ summary: 'Ver notas del docente sobre un alumno, agrupadas por mes' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno' })
  @ApiResponse({ status: 200, description: 'Array de { month: "2026-04", notes: [...] }' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  getNotes(@CurrentUser() user: any, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.teachersService.getNotesByStudent(user.sub, studentId);
  }

  @Post('me/students/:studentId/notes')
  @ApiOperation({ summary: 'Agregar una nota sobre un alumno' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno' })
  @ApiResponse({ status: 201, description: 'Nota creada.' })
  @ApiResponse({ status: 400, description: 'Contenido inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  addNote(@CurrentUser() user: any, @Param('studentId', ParseUUIDPipe) studentId: string, @Body() dto: CreateNoteDto) {
    return this.teachersService.addNote(user.sub, studentId, dto.content);
  }

  @Delete('me/students/:studentId/notes/:noteId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una nota sobre un alumno' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno' })
  @ApiParam({ name: 'noteId', description: 'UUID de la nota' })
  @ApiResponse({ status: 200, description: 'Nota eliminada.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso para eliminar esta nota.' })
  @ApiResponse({ status: 404, description: 'Nota no encontrada.' })
  deleteNote(
    @CurrentUser() user: any,
    @Param('studentId', ParseUUIDPipe) _studentId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.teachersService.deleteNote(user.sub, noteId);
  }
}
