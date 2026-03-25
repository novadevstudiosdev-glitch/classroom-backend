import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

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
  @ApiResponse({ status: 404, description: 'Perfil no encontrado.' })
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
}
