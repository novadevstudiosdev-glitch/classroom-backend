import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateMinigameDto } from './dto/create-minigame.dto';
import { UpdateMinigameDto } from './dto/update-minigame.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsIn, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationTargetRole } from '../notifications/entities/notification.entity';

class BroadcastDto {
  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(150) title: string;
  @ApiProperty() @IsNotEmpty() @IsString() message: string;
  @ApiPropertyOptional({ enum: ['student', 'teacher', 'parent', 'all'], default: 'all' })
  @IsIn(['student', 'teacher', 'parent', 'all']) target_role: NotificationTargetRole = 'all';
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── STATS ────────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas globales de la plataforma', description: 'Totales de usuarios por rol, clases, lecciones y minijuegos.' })
  @ApiResponse({ status: 200, description: 'Objeto con contadores globales.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('stats/daily')
  @ApiOperation({ summary: 'Tendencias diarias: registros, sesiones y completions (últimos 30 días)' })
  @ApiResponse({ status: 200, description: 'Array de 30 días con contadores diarios de registros, sesiones y lecciones completadas.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  getDailyTrends() {
    return this.adminService.getDailyTrends();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Métricas de actividad — sesiones, completions, top estudiantes y docentes' })
  @ApiResponse({ status: 200, description: 'Métricas de actividad con rankings de usuarios más activos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // ─── USERS ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Listar todos los usuarios con filtro por rol y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de usuarios con su perfil y estado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/export')
  @ApiOperation({ summary: 'Exportar usuarios como CSV', description: 'Descarga un archivo CSV con todos los usuarios. Filtrá por rol con ?role=teacher|student|parent.' })
  @ApiQuery({ name: 'role', required: false, enum: ['teacher', 'student', 'parent'], description: 'Filtrar por rol (opcional)' })
  @ApiResponse({ status: 200, description: 'Archivo CSV descargable con todos los usuarios.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  async exportUsers(@Query('role') role: string | undefined, @Res() res: Response) {
    const csv = await this.adminService.exportUsersAsCsv(role);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Obtener detalle de un usuario por ID' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Datos del usuario con perfil, rol y estado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender un usuario (soft delete)', description: 'El usuario queda con deleted_at seteado y no puede iniciar sesión. Registra la acción en el audit log.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario suspendido.' })
  @ApiResponse({ status: 400, description: 'No podés suspenderte a vos mismo.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  suspendUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.suspendUser(id, user.sub);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar un usuario suspendido', description: 'Limpia el deleted_at del usuario. Registra la acción en el audit log.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario restaurado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado o no estaba suspendido.' })
  restoreUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.restoreUser(id, user.sub);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar permanentemente un usuario', description: 'Hard delete. Irreversible. Registra la acción en el audit log.' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado permanentemente.' })
  @ApiResponse({ status: 400, description: 'No podés eliminarte a vos mismo.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.deleteUser(id, user.sub);
  }

  // ─── CLASSROOMS ───────────────────────────────────────────────────────────

  @Get('classrooms')
  @ApiOperation({ summary: 'Ver todas las clases de la plataforma' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'teacherId', required: false, description: 'UUID del docente para filtrar sus clases' })
  @ApiResponse({ status: 200, description: 'Lista paginada de clases con docente y cantidad de alumnos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  listAllClassrooms(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.adminService.listAllClassrooms(Number(page) || 1, Number(limit) || 20, teacherId);
  }

  // ─── LESSONS ──────────────────────────────────────────────────────────────

  @Get('lessons')
  @ApiOperation({ summary: 'Ver todas las lecciones de la plataforma' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published'] })
  @ApiResponse({ status: 200, description: 'Lista paginada de lecciones con docente y estado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  listAllLessons(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listAllLessons(Number(page) || 1, Number(limit) || 20, status);
  }

  @Patch('lessons/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Despublicar una lección (vuelve a draft)', description: 'La lección deja de ser visible para los alumnos. Registra la acción en el audit log.' })
  @ApiParam({ name: 'id', description: 'UUID de la lección' })
  @ApiResponse({ status: 200, description: 'Lección despublicada.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada.' })
  unpublishLesson(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.unpublishLesson(id, user.sub);
  }

  // ─── MINIGAMES ────────────────────────────────────────────────────────────

  @Get('minigames')
  @ApiOperation({ summary: 'Listar todos los minijuegos del catálogo (activos e inactivos)' })
  @ApiResponse({ status: 200, description: 'Array con todos los minijuegos del catálogo.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  listMinigames() {
    return this.adminService.listMinigames();
  }

  @Post('minigames')
  @ApiOperation({ summary: 'Crear un nuevo minijuego en el catálogo', description: 'Agrega un nuevo tipo de minijuego disponible para que los docentes creen instancias.' })
  @ApiResponse({ status: 201, description: 'Minijuego creado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  createMinigame(@Body() dto: CreateMinigameDto) {
    return this.adminService.createMinigame(dto);
  }

  @Patch('minigames/:id')
  @ApiOperation({ summary: 'Actualizar título, descripción o config de un minijuego' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Minijuego actualizado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  updateMinigame(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMinigameDto) {
    return this.adminService.updateMinigame(id, dto);
  }

  @Patch('minigames/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar o desactivar un minijuego del catálogo', description: 'Toggle: si estaba activo lo desactiva (ya no aparece para los docentes), y viceversa.' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Estado del minijuego actualizado.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  toggleMinigame(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.toggleMinigame(id);
  }

  @Delete('minigames/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un minijuego del catálogo',
    description: 'Soft delete con grace period de 7 días. Elimina en cascada todas las instancias y asignaciones asociadas. Registra la acción en el audit log.',
  })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Minijuego marcado para eliminación.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  deleteMinigame(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.deleteMinigame(id, user.sub);
  }

  // ─── AUDIT LOG ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'Historial de acciones del panel admin (audit log)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'action', required: false, description: 'Filtrar por tipo de acción (ej: suspend_user, delete_lesson)' })
  @ApiQuery({ name: 'adminId', required: false, description: 'UUID del admin para filtrar sus acciones' })
  @ApiResponse({ status: 200, description: 'Lista paginada del audit log con admin, acción y metadata.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
  ) {
    return this.adminService.getAuditLogs(Number(page) || 1, Number(limit) || 50, action, adminId);
  }

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({ summary: 'Listar broadcasts enviados' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Lista paginada de broadcasts enviados con fecha, título y target_role.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  listNotifications(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listNotifications(Number(page) || 1, Number(limit) || 20);
  }

  @Post('notifications/broadcast')
  @ApiOperation({ summary: 'Enviar una notificación broadcast a un rol o a todos', description: 'Crea una notificación visible para todos los usuarios del rol indicado (o todos si target_role es "all").' })
  @ApiResponse({ status: 201, description: 'Notificación enviada.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (title o message vacíos).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo los admins pueden acceder.' })
  broadcastNotification(@Body() dto: BroadcastDto, @CurrentUser() user: any) {
    return this.adminService.broadcast(user.sub, dto.title, dto.message, dto.target_role);
  }
}
