import { Controller, Get, Patch, Post, Body, Param, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('student')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del alumno autenticado' })
  @ApiResponse({ status: 200, description: 'Retorna el perfil del alumno.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado.' })
  getMe(@CurrentUser() user: any) {
    return this.studentsService.getProfile(user.sub);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Actualizar perfil del alumno (alias, avatar, bio, estado, fecha de nacimiento)' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateStudentProfileDto) {
    return this.studentsService.updateProfile(user.sub, dto);
  }

  @Post('me/link-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener o generar código de vinculación para que el padre se conecte', description: 'Si ya existe un link_code lo retorna; si no, genera uno nuevo de 8 caracteres.' })
  @ApiResponse({ status: 200, description: 'Código de vinculación (8 chars).' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  getLinkCode(@CurrentUser() user: any) {
    return this.studentsService.generateLinkCode(user.sub);
  }

  @Get('me/parent-requests')
  @ApiOperation({ summary: 'Ver solicitudes de vinculación pendientes de padres' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes pendientes.' })
  getParentRequests(@CurrentUser() user: any) {
    return this.studentsService.getParentRequests(user.sub);
  }

  @Patch('me/parent-requests/:requestId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar solicitud de vinculación de un padre' })
  @ApiResponse({ status: 200, description: 'Vinculación confirmada.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  confirmParentRequest(@CurrentUser() user: any, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.studentsService.confirmParentRequest(user.sub, requestId);
  }

  @Patch('me/parent-requests/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar solicitud de vinculación de un padre' })
  @ApiResponse({ status: 200, description: 'Solicitud rechazada.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  rejectParentRequest(@CurrentUser() user: any, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.studentsService.rejectParentRequest(user.sub, requestId);
  }

  @Get('me/feed')
  @ApiOperation({ summary: 'Feed del alumno: lecciones y minijuegos de todas sus clases activas', description: 'Retorna el contenido agrupado por clase, con estado de progreso de cada ítem.' })
  @ApiResponse({ status: 200, description: 'Feed consolidado por clase.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  getFeed(@CurrentUser() user: any) {
    return this.studentsService.getFeed(user.sub);
  }
}
