import { IsString, IsOptional, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const GRADE_LEVELS = ['1st', '2nd', '3rd', '4th', '5th', '6th'] as const;

export class CreateClassroomDto {
  @ApiProperty({ example: '3° Grado A', description: 'Nombre de la clase' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Clase de matemáticas del turno mañana' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '3rd',
    enum: GRADE_LEVELS,
    description: 'Nivel educativo (1st a 6th grade)',
  })
  @IsOptional()
  @IsIn(GRADE_LEVELS)
  grade_level?: string;
}
