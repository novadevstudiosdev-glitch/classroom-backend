import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTeacherDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsOptional()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsOptional()
  last_name?: string;

  @ApiPropertyOptional({ example: 'Argentina' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  @IsString()
  @IsOptional()
  avatar_url?: string;
}
