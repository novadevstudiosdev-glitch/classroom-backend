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
  ApiBody,
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
  @ApiBody({
    description: 'Seleccioná un tipo de ejercicio del dropdown de Examples',
    examples: {
      multiple_choice: {
        summary: 'Opción múltiple',
        value: {
          lesson_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          type: 'multiple_choice',
          title: '¿Cuánto es 2+2?',
          order: 0,
          config_json: { question: '¿Cuánto es 2+2?', options: ['2', '3', '4', '5'], correct_index: 2 },
        },
      },
      fill_blank: {
        summary: 'Completar espacios',
        value: {
          lesson_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          type: 'fill_blank',
          title: 'Completar los espacios',
          order: 1,
          config_json: { text_with_blanks: 'El cielo es ___ y el sol es ___.', answers: ['azul', 'amarillo'] },
        },
      },
      true_false: {
        summary: 'Verdadero o Falso',
        value: {
          lesson_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          type: 'true_false',
          title: '¿La Tierra es plana?',
          order: 2,
          config_json: { statement: 'La Tierra es plana.', correct_answer: false },
        },
      },
      match_columns: {
        summary: 'Unir columnas',
        value: {
          lesson_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          type: 'match_columns',
          title: 'Unir con su traducción',
          order: 3,
          config_json: { pairs: [{ left: 'Perro', right: 'Dog' }, { left: 'Gato', right: 'Cat' }] },
        },
      },
      order_items: {
        summary: 'Ordenar elementos',
        value: {
          lesson_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          type: 'order_items',
          title: 'Ordenar los pasos',
          order: 4,
          config_json: { items: ['Paso 1', 'Paso 2', 'Paso 3'], instruction: 'Ordená los pasos correctamente.' },
        },
      },
    },
  })
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
  @ApiBody({
    description: 'Todos los campos son opcionales. Si mandás config_json debe matchear el tipo original del ejercicio.',
    examples: {
      multiple_choice: {
        summary: 'Opción múltiple',
        value: {
          title: 'Nueva pregunta',
          config_json: { question: '¿Cuántos continentes hay?', options: ['5', '6', '7', '8'], correct_index: 2 },
        },
      },
      fill_blank: {
        summary: 'Completar espacios',
        value: {
          title: 'Nuevo título',
          config_json: { text_with_blanks: 'El agua hierve a ___ grados.', answers: ['100'] },
        },
      },
      true_false: {
        summary: 'Verdadero o Falso',
        value: {
          title: 'Nuevo título',
          config_json: { statement: 'El sol es una estrella.', correct_answer: true },
        },
      },
      match_columns: {
        summary: 'Unir columnas',
        value: {
          title: 'Nuevo título',
          config_json: { pairs: [{ left: 'Perro', right: 'Dog' }, { left: 'Gato', right: 'Cat' }] },
        },
      },
      order_items: {
        summary: 'Ordenar elementos',
        value: {
          title: 'Nuevo título',
          config_json: { items: ['Paso A', 'Paso B', 'Paso C'], instruction: 'Ordená correctamente.' },
        },
      },
      solo_titulo: {
        summary: 'Solo cambiar título',
        value: { title: 'Título actualizado' },
      },
    },
  })
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
