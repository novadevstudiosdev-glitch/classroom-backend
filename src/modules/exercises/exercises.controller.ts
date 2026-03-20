import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Exercises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('teacher')
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un ejercicio en una lección' })
  @ApiResponse({ status: 201, description: 'Ejercicio creado.' })
  @ApiResponse({ status: 400, description: 'config_json inválido para el tipo.' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada.' })
  async create(@CurrentUser() user: any, @Body() dto: CreateExerciseDto) {
    return this.exercisesService.create(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ejercicio por ID' })
  @ApiResponse({ status: 404, description: 'Ejercicio no encontrado.' })
  async findOne(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exercisesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un ejercicio' })
  @ApiResponse({ status: 400, description: 'config_json inválido para el tipo.' })
  @ApiResponse({ status: 404, description: 'Ejercicio no encontrado.' })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExerciseDto,
  ) {
    return this.exercisesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar un ejercicio' })
  @ApiResponse({ status: 404, description: 'Ejercicio no encontrado.' })
  async remove(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exercisesService.remove(user.sub, id);
  }
}
