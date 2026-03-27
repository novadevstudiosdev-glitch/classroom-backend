import { IsOptional, IsString, IsEmail, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LinkChildDto {
  @ApiPropertyOptional({ description: 'Email del alumno' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Código de vinculación generado por el alumno (8 chars)' })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  link_code?: string;
}
