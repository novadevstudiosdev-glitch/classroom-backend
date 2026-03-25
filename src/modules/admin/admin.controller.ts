import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateMinigameDto } from './dto/create-minigame.dto';
import { UpdateMinigameDto } from './dto/update-minigame.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─────────────────────────────────────────────────
  // STATS GLOBALES
  // ─────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas globales de la plataforma' })
  @ApiResponse({ status: 200, description: 'Totales de usuarios por rol, contenido activo y XP distribuido.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo administradores.' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Métricas de actividad de la plataforma',
    description: 'Sesiones y lecciones completadas en los últimos 7 y 30 días. Top 5 alumnos por XP y top 5 docentes por clases activas.',
  })
  @ApiResponse({ status: 200, description: 'Métricas de sesiones, completions y rankings.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo administradores.' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // ─────────────────────────────────────────────────
  // GESTIÓN DE USUARIOS
  // ─────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Listar todos los usuarios con filtro por rol y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de usuarios con metadata de paginación.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo administradores.' })
  listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Obtener detalle de un usuario por ID' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Datos del usuario incluyendo estado de suspensión.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender un usuario (soft delete — sigue en la DB)' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario suspendido. No puede iniciar sesión.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'El usuario ya está suspendido.' })
  suspendUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendUser(id);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar un usuario suspendido' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario restaurado. Puede volver a iniciar sesión.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'El usuario no está suspendido.' })
  restoreUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.restoreUser(id);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar permanentemente un usuario',
    description: 'Eliminación física de la DB. Irreversible. Usar solo cuando sea estrictamente necesario.',
  })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado permanentemente.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteUser(id);
  }

  // ─────────────────────────────────────────────────
  // GESTIÓN DE MINIGAMES
  // ─────────────────────────────────────────────────

  @Get('minigames')
  @ApiOperation({ summary: 'Listar todos los minijuegos (activos e inactivos)' })
  @ApiResponse({ status: 200, description: 'Lista completa de minijuegos del catálogo.' })
  listMinigames() {
    return this.adminService.listMinigames();
  }

  @Post('minigames')
  @ApiOperation({ summary: 'Crear un nuevo minijuego en el catálogo' })
  @ApiResponse({ status: 201, description: 'Minijuego creado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un minijuego con ese slug.' })
  createMinigame(@Body() dto: CreateMinigameDto) {
    return this.adminService.createMinigame(dto);
  }

  @Patch('minigames/:id')
  @ApiOperation({ summary: 'Actualizar título, descripción o config de un minijuego' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Minijuego actualizado.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  updateMinigame(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMinigameDto) {
    return this.adminService.updateMinigame(id, dto);
  }

  @Patch('minigames/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar o desactivar un minijuego del catálogo' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Estado is_active del minijuego actualizado.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  toggleMinigame(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.toggleMinigame(id);
  }

  @Delete('minigames/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar un minijuego del catálogo' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Minijuego eliminado.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado.' })
  deleteMinigame(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteMinigame(id);
  }
}
