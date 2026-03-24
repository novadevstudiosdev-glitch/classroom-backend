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
  // STATS
  // ─────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas globales de la plataforma' })
  @ApiResponse({ status: 200, description: 'Totales de usuarios, contenido y engagement.' })
  getStats() {
    return this.adminService.getStats();
  }

  // ─────────────────────────────────────────────────
  // USUARIOS
  // ─────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Listar todos los usuarios con filtro por rol y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de usuarios.' })
  listUsers(@Query() dto: ListUsersDto) {
    return this.adminService.listUsers(dto);
  }

  @Delete('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender un usuario (soft delete)' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario suspendido.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'El usuario ya está suspendido.' })
  suspendUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.suspendUser(id);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar un usuario suspendido' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario restaurado.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'El usuario no está suspendido.' })
  restoreUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.restoreUser(id);
  }

  // ─────────────────────────────────────────────────
  // MINIGAMES
  // ─────────────────────────────────────────────────

  @Get('minigames')
  @ApiOperation({ summary: 'Listar todos los minijuegos (activos e inactivos)' })
  @ApiResponse({ status: 200, description: 'Lista completa de minijuegos.' })
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
  @ApiOperation({ summary: 'Activar o desactivar un minijuego' })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Estado del minijuego actualizado.' })
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
