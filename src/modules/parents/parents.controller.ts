import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ParentsService } from './parents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Parents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('parent')
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del padre/tutor autenticado con alumnos vinculados' })
  @ApiResponse({ status: 200, description: 'Retorna el perfil del padre con la lista de alumnos vinculados.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 404, description: 'Perfil no encontrado.' })
  async getMe(@CurrentUser() user: any) {
    return this.parentsService.getProfile(user.sub);
  }
}
