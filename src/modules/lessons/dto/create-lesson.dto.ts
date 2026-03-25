import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';

export class CreateLessonDto {
  @ApiProperty({ example: 'Introducción a las sumas' })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: 'En esta lección aprendemos a sumar números del 1 al 10.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: { blocks: [{ type: 'paragraph', text: 'Hola mundo' }] },
    description: 'Contenido del editor de texto enriquecido en formato JSON',
  })
  @IsOptional()
  @IsObject()
  content_json?: Record<string, any>;
}
