import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { AssignLessonDto } from './dto/assign-lesson.dto';
import { ListLessonsDto } from './dto/list-lessons.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles('teacher')
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una lección en borrador' })
  @ApiResponse({ status: 201, description: 'Lección creada.' })
  async create(@CurrentUser() user: any, @Body() dto: CreateLessonDto) {
    return this.lessonsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar lecciones del docente (paginado, filtro por status)' })
  async findAll(@CurrentUser() user: any, @Query() query: ListLessonsDto) {
    return this.lessonsService.findAll(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una lección con sus ejercicios' })
  @ApiResponse({ status: 404, description: 'Lección no encontrada.' })
  async findOne(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lessonsService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar una lección (también para publicarla)' })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.lessonsService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una lección (soft delete, bloqueado si está asignada)' })
  @ApiResponse({ status: 403, description: 'No se puede eliminar una lección asignada.' })
  async remove(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lessonsService.remove(user.sub, id);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Asignar una lección a una clase con fecha límite opcional' })
  @ApiResponse({ status: 403, description: 'Solo se pueden asignar lecciones publicadas.' })
  async assign(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLessonDto,
  ) {
    return this.lessonsService.assign(user.sub, id, dto);
  }
}
