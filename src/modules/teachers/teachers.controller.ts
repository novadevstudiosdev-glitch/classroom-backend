import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Teachers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del docente autenticado' })
  async getMe(@CurrentUser() user: any) {
    return this.teachersService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar perfil del docente autenticado' })
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.updateProfile(user.sub, dto);
  }
}
