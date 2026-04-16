import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ParentsService } from './parents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LinkChildDto } from './dto/link-child.dto';
import { UpdateParentProfileDto } from './dto/update-parent-profile.dto';

@ApiTags('Parents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('parent')
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Patch('me/profile')
  @ApiOperation({ summary: 'Actualizar perfil del padre/tutor' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateParentProfileDto) {
    return this.parentsService.updateProfile(user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del padre/tutor autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del padre con todos los vínculos.' })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado.' })
  getMe(@CurrentUser() user: any) {
    return this.parentsService.getProfile(user.sub);
  }

  @Get('me/children')
  @ApiOperation({ summary: 'Ver hijos vinculados y confirmados con su progreso' })
  @ApiResponse({ status: 200, description: 'Lista de hijos con XP, nivel y clases activas.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  getChildren(@CurrentUser() user: any) {
    return this.parentsService.getChildren(user.sub);
  }

  @Post('me/children')
  @ApiOperation({
    summary: 'Vincular un hijo (por email o por código de vinculación)',
    description: 'El alumno debe confirmar la vinculación desde su app.',
  })
  @ApiResponse({ status: 201, description: 'Solicitud enviada al alumno.' })
  @ApiResponse({ status: 400, description: 'Debés proveer email o link_code.' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un vínculo o solicitud.' })
  linkChild(@CurrentUser() user: any, @Body() dto: LinkChildDto) {
    return this.parentsService.linkChild(user.sub, dto);
  }

  @Delete('me/children/:studentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desvincular un hijo' })
  @ApiParam({ name: 'studentId', description: 'UUID del perfil del alumno' })
  @ApiResponse({ status: 200, description: 'Vínculo eliminado.' })
  @ApiResponse({ status: 404, description: 'Vínculo no encontrado.' })
  unlinkChild(@CurrentUser() user: any, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.parentsService.unlinkChild(user.sub, studentId);
  }
}
