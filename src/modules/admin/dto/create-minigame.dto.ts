import { IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMinigameDto {
  @ApiProperty({ example: 'word-runner-v2', description: 'Slug único del minijuego' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  slug: string;

  @ApiProperty({ example: 'Word Runner', description: 'Título del minijuego' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: 'Completá palabras antes de que se acabe el tiempo' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'word_runner', description: 'Tipo de minijuego (word_runner, memory_match, quiz_rush, etc.)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  type: string;

  @ApiPropertyOptional({ example: { duration_seconds: 60, lives: 3 }, description: 'Configuración base del minijuego' })
  @IsOptional()
  config_json?: Record<string, any>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean = true;
}
