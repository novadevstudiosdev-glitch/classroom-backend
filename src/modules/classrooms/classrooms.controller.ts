import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';

import { ClassroomsService } from './classrooms.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Classrooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classroomsService: ClassroomsService) {}

  // ─────────────────────────────────────────────────
  // DOCENTE — CRUD de sus clases
  // ─────────────────────────────────────────────────

  @Post()
  @Roles('teacher')
  @ApiOperation({ summary: 'Crear una nueva clase' })
  @ApiResponse({ status: 201, description: 'Clase creada con su código de invitación.' })
  @ApiResponse({ status: 403, description: 'Límite de clases del plan gratuito alcanzado.' })
  create(@CurrentUser() user: any, @Body() dto: CreateClassroomDto) {
    return this.classroomsService.create(user.id, dto);
  }

  @Get()
  @Roles('teacher')
  @ApiOperation({ summary: 'Listar todas las clases del docente' })
  @ApiQuery({
    name: 'archived',
    required: false,
    type: Boolean,
    description: 'Si es true, devuelve las clases archivadas',
  })
  findAll(@CurrentUser() user: any, @Query('archived') archived?: string) {
    return this.classroomsService.findAllByTeacher(user.id, archived === 'true');
  }

  @Get('my-classes')
  @Roles('student')
  @ApiOperation({ summary: 'Listar las clases activas del alumno autenticado' })
  findStudentClasses(@CurrentUser() user: any) {
    // El profile_id del alumno viene en el JWT
    return this.classroomsService.findAllByStudent(user.profile_id);
  }

  @Get(':id')
  @Roles('teacher')
  @ApiOperation({ summary: 'Obtener detalle de una clase con lista de alumnos' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Clase con lista de alumnos y última actividad.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles('teacher')
  @ApiOperation({ summary: 'Actualizar nombre, descripción, nivel o estado de una clase' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() dto: UpdateClassroomDto) {
    return this.classroomsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar una clase (soft delete — la archiva)',
    description: 'No elimina físicamente la clase ni el historial de alumnos.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.remove(id, user.id);
  }

  // ─────────────────────────────────────────────────
  // ACCIONES ESPECIALES
  // ─────────────────────────────────────────────────

  @Post(':id/regenerate-code')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerar el código de invitación',
    description: 'El código anterior queda inválido. Útil si fue compartido por error.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  regenerateCode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.regenerateInviteCode(id, user.id);
  }

  @Delete(':id/students/:studentId')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover un alumno de la clase' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno (student_profile.id)' })
  removeStudent(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() user: any) {
    return this.classroomsService.removeStudent(id, studentId, user.id);
  }

  @Get(':id/progress')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Matriz de progreso de la clase (lecciones × alumnos)',
    description: 'Placeholder — se completa al implementar el módulo lessons/progress.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  getProgress(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.getProgress(id, user.id);
  }
}
