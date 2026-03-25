import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StartSessionDto {
  @ApiPropertyOptional({ description: 'ID del salón desde donde se inicia la sesión' })
  @IsOptional()
  @IsUUID()
  classroom_id?: string;
}
