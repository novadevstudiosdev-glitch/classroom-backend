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
  @ApiOperation({ summary: 'Estadísticas globales de la plataforma' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('stats/daily')
  @ApiOperation({ summary: 'Tendencias diarias: registros, sesiones y completions (últimos 30 días)' })
  getDailyTrends() {
    return this.adminService.getDailyTrends();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Métricas de actividad — sesiones, completions, top estudiantes y docentes' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // ─── USERS ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Listar todos los usuarios con filtro por rol y paginación' })
  listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/export')
  @ApiOperation({ summary: 'Exportar usuarios como CSV' })
  @ApiQuery({ name: 'role', required: false })
  async exportUsers(@Query('role') role: string | undefined, @Res() res: Response) {
    const csv = await this.adminService.exportUsersAsCsv(role);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Obtener detalle de un usuario por ID' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender un usuario (soft delete)' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  suspendUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.suspendUser(id, user.sub);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar un usuario suspendido' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  restoreUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.restoreUser(id, user.sub);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar permanentemente un usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.deleteUser(id, user.sub);
  }

  // ─── CLASSROOMS ───────────────────────────────────────────────────────────

  @Get('classrooms')
  @ApiOperation({ summary: 'Ver todas las clases de la plataforma' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'teacherId', required: false })
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
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published'] })
  listAllLessons(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listAllLessons(Number(page) || 1, Number(limit) || 20, status);
  }

  @Patch('lessons/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Despublicar una lección (vuelve a draft)' })
  @ApiParam({ name: 'id', description: 'UUID de la lección' })
  unpublishLesson(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.unpublishLesson(id, user.sub);
  }

  // ─── MINIGAMES ────────────────────────────────────────────────────────────

  @Get('minigames')
  @ApiOperation({ summary: 'Listar todos los minijuegos (activos e inactivos)' })
  listMinigames() {
    return this.adminService.listMinigames();
  }

  @Post('minigames')
  @ApiOperation({ summary: 'Crear un nuevo minijuego en el catálogo' })
  createMinigame(@Body() dto: CreateMinigameDto) {
    return this.adminService.createMinigame(dto);
  }

  @Patch('minigames/:id')
  @ApiOperation({ summary: 'Actualizar título, descripción o config de un minijuego' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  updateMinigame(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMinigameDto) {
    return this.adminService.updateMinigame(id, dto);
  }

  @Patch('minigames/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar o desactivar un minijuego del catálogo' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  toggleMinigame(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.toggleMinigame(id);
  }

  @Delete('minigames/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un minijuego (cascade, soft delete 7 días)',
    description: 'Elimina también todas las instancias y asignaciones.',
  })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  deleteMinigame(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.adminService.deleteMinigame(id, user.sub);
  }

  // ─── AUDIT LOG ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'Historial de acciones del panel admin (audit log)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'adminId', required: false })
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
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listNotifications(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listNotifications(Number(page) || 1, Number(limit) || 20);
  }

  @Post('notifications/broadcast')
  @ApiOperation({ summary: 'Enviar una notificación broadcast a un rol o a todos' })
  @ApiResponse({ status: 201, description: 'Notificación enviada.' })
  broadcastNotification(@Body() dto: BroadcastDto, @CurrentUser() user: any) {
    return this.adminService.broadcast(user.sub, dto.title, dto.message, dto.target_role);
  }
}
