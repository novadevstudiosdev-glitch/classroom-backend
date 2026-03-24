import { IsString, IsUUID, IsOptional, IsArray, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMinigameInstanceDto {
  @ApiProperty({ description: 'ID del template de minijuego (de NovaDev)' })
  @IsUUID()
  minigame_id: string;

  @ApiProperty({ description: 'Título del minijuego', example: 'Los animales de la selva' })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ description: 'Descripción opcional' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Contenido creado por el docente (preguntas, pares, palabras, etc.)',
    example: [{ question: '¿Cuál es el animal más grande?', answer: 'Elefante', options: ['Jirafa', 'Elefante', 'León'] }],
  })
  @IsArray()
  content_json: Record<string, any>[];

  @ApiPropertyOptional({
    description: 'Configuración visual y de gameplay',
    example: { theme: 'jungle', timer: 60, lives: 3 },
  })
  @IsOptional()
  @IsObject()
  config_json?: Record<string, any>;
}
