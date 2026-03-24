import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListUsersDto {
  @ApiPropertyOptional({ enum: ['teacher', 'student', 'parent', 'admin'], description: 'Filtrar por rol' })
  @IsOptional()
  @IsIn(['teacher', 'student', 'parent', 'admin'])
  role?: string;

  @ApiPropertyOptional({ default: 1, description: 'Número de página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Resultados por página (máx 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
