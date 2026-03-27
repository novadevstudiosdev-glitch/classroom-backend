import { IsUUID, IsNumber, IsBoolean, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MinigameEventDto {
  @ApiProperty({ description: 'ID de la sesión activa' })
  @IsUUID()
  session_id: string;

  @ApiProperty({ description: 'ID del minijuego (template) jugado' })
  @IsUUID()
  minigame_id: string;

  @ApiPropertyOptional({ description: 'ID de la instancia de minijuego (para guardar el snapshot del contenido)' })
  @IsOptional()
  @IsUUID()
  instance_id?: string;

  @ApiProperty({ description: 'Puntaje obtenido', example: 850 })
  @IsNumber()
  @Min(0)
  score: number;

  @ApiProperty({ description: 'Puntaje máximo posible', example: 1000 })
  @IsNumber()
  @Min(1)
  max_score: number;

  @ApiProperty({ description: 'Si el alumno completó el minijuego' })
  @IsBoolean()
  completed: boolean;
}
