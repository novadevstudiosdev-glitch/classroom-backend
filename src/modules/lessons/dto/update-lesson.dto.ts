import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsEnum, MaxLength } from 'class-validator';
import { LessonStatus } from '../entities/lesson.entity';

export class UpdateLessonDto {
  @ApiPropertyOptional({ example: 'Introducción a las sumas (actualizado)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: { blocks: [] } })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, any>;

  @ApiPropertyOptional({ enum: ['draft', 'published'], example: 'published' })
  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: LessonStatus;
}
