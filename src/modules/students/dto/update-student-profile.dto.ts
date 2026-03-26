import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({ description: 'Alias visible en la plataforma', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  alias?: string;

  @ApiPropertyOptional({ description: 'ID de avatar predefinido', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  avatar_id?: string;

  @ApiPropertyOptional({ description: 'Descripción breve del alumno', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Mensaje de estado', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status_message?: string;

  @ApiPropertyOptional({ description: 'Fecha de nacimiento (ISO 8601: YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  birth_date?: string;
}
