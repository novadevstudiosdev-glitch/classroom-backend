import { Controller, Get, Param } from '@nestjs/common';
import { MinigamesService } from './minigames.service';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Minigames')
@ApiBearerAuth()
@Roles('student', 'teacher')
@Controller('minigames')
export class MinigamesController {
  constructor(private readonly minigamesService: MinigamesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todos los minijuegos activos de la plataforma',
    description: 'Retorna los minijuegos de NovaDev disponibles para crear instancias. Accesible para docentes y alumnos.',
  })
  @ApiResponse({ status: 200, description: 'Array de minijuegos activos con slug, tipo y configuración base.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo docentes y alumnos pueden acceder.' })
  findAll() {
    return this.minigamesService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un minijuego por ID',
    description: 'Retorna el detalle completo de un minijuego incluyendo su config_json.',
  })
  @ApiParam({ name: 'id', description: 'UUID del minijuego' })
  @ApiResponse({ status: 200, description: 'Datos del minijuego con slug, tipo, descripción y configuración.' })
  @ApiResponse({ status: 401, description: 'Token inválido o no enviado.' })
  @ApiResponse({ status: 403, description: 'Solo docentes y alumnos pueden acceder.' })
  @ApiResponse({ status: 404, description: 'Minijuego no encontrado o inactivo.' })
  findOne(@Param('id') id: string) {
    return this.minigamesService.findOne(id);
  }
}
