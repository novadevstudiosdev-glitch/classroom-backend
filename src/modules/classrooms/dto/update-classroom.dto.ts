import { IsString, IsOptional, IsBoolean, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GRADE_LEVELS } from './create-classroom.dto';

export const CLASSROOM_STATUSES = ['active', 'pending', 'finished'] as const;

export class UpdateClassroomDto {
  @ApiPropertyOptional({ example: '3° Grado B' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Clase actualizada' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: GRADE_LEVELS })
  @IsOptional()
  @IsIn(GRADE_LEVELS)
  grade_level?: string;

  @ApiPropertyOptional({ example: true, description: 'Archivar o desarchivar la clase' })
  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;

  @ApiPropertyOptional({ enum: CLASSROOM_STATUSES, example: 'active', description: 'Estado de la clase: active (en curso), pending (no iniciada), finished (ciclo cerrado)' })
  @IsOptional()
  @IsIn(CLASSROOM_STATUSES)
  status?: 'active' | 'pending' | 'finished';
}
