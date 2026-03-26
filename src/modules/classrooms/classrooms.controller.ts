import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';

import { ClassroomsService } from './classrooms.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { UpdateClassroomDto } from './dto/update-classroom.dto';
import { JoinClassroomDto } from './dto/join-classroom.dto';
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
    return this.classroomsService.create(user.sub, dto);
  }

  @Get()
  @Roles('teacher')
  @ApiOperation({ summary: 'Listar todas las clases del docente' })
  @ApiResponse({ status: 200, description: 'Array de clases del docente con cantidad de alumnos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiQuery({
    name: 'archived',
    required: false,
    type: Boolean,
    description: 'Si es true, devuelve las clases archivadas',
  })
  findAll(@CurrentUser() user: any, @Query('archived') archived?: string) {
    return this.classroomsService.findAllByTeacher(user.sub, archived === 'true');
  }

  @Get('my-classes')
  @Roles('student')
  @ApiOperation({ summary: 'Listar las clases activas del alumno autenticado' })
  @ApiResponse({ status: 200, description: 'Array de clases a las que pertenece el alumno.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  findStudentClasses(@CurrentUser() user: any) {
    return this.classroomsService.findAllByStudent(user.profile_id);
  }

  @Post('join')
  @Roles('student')
  @ApiOperation({ summary: 'Unirse a una clase con código de invitación', description: 'El alumno ya registrado ingresa el invite_code que le dio el docente para unirse a su clase.' })
  @ApiResponse({ status: 201, description: 'Alumno unido a la clase correctamente.' })
  @ApiResponse({ status: 400, description: 'Código con formato inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 404, description: 'Código de invitación inválido o clase no encontrada.' })
  @ApiResponse({ status: 409, description: 'El alumno ya pertenece a esta clase.' })
  joinClassroom(@CurrentUser() user: any, @Body() dto: JoinClassroomDto) {
    return this.classroomsService.joinClassroom(user.profile_id, dto.invite_code);
  }

  @Get(':id')
  @Roles('teacher')
  @ApiOperation({ summary: 'Obtener detalle de una clase con lista de alumnos' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Clase con lista de alumnos y última actividad.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @Roles('teacher')
  @ApiOperation({ summary: 'Actualizar nombre, descripción, nivel o estado de una clase' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Clase actualizada.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any, @Body() dto: UpdateClassroomDto) {
    return this.classroomsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar una clase (soft delete — la archiva)',
    description: 'No elimina físicamente la clase ni el historial de alumnos.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Clase archivada correctamente.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.remove(id, user.sub);
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
  @ApiResponse({ status: 200, description: 'Retorna el nuevo invite_code.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  regenerateCode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.regenerateInviteCode(id, user.sub);
  }

  @Delete(':id/leave')
  @Roles('student')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El alumno sale de una clase' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Saliste de la clase. El historial queda archivado.' })
  @ApiResponse({ status: 404, description: 'No pertenecés a esta clase.' })
  @ApiResponse({ status: 409, description: 'Ya saliste de esta clase.' })
  leaveClassroom(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.leaveClassroom(id, user.sub);
  }

  @Delete(':id/students/:studentId')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover un alumno de la clase' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno (student_profile.id)' })
  @ApiResponse({ status: 200, description: 'Alumno removido de la clase.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase o alumno no encontrado.' })
  removeStudent(@Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() user: any) {
    return this.classroomsService.removeStudent(id, studentId, user.sub);
  }

  @Get(':id/stats')
  @Roles('teacher')
  @ApiOperation({ summary: 'Estadísticas de la clase — alumnos, lecciones y top estudiantes' })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Total de alumnos, progreso por lección y ranking de los 5 mejores alumnos.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  getStats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.getStats(id, user.sub);
  }

  @Post(':id/students/import')
  @Roles('teacher')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Importar alumnos desde CSV',
    description: 'CSV con columnas: email, alias. Crea cuentas nuevas y agrega a los existentes directamente a la clase.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 201, description: 'Resultado del import: imported, already_existed, added_to_class, failed.' })
  importStudents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo CSV requerido.');
    return this.classroomsService.importStudentsCsv(id, user.sub, file.buffer);
  }

  @Get(':id/progress')
  @Roles('teacher')
  @ApiOperation({
    summary: 'Matriz de progreso de la clase (lecciones × alumnos)',
    description: 'Placeholder — se completa al implementar el módulo lessons/progress.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la clase' })
  @ApiResponse({ status: 200, description: 'Matriz de progreso por alumno y lección.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'No tenés permiso sobre esta clase.' })
  @ApiResponse({ status: 404, description: 'Clase no encontrada.' })
  getProgress(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.classroomsService.getProgress(id, user.sub);
  }
}
