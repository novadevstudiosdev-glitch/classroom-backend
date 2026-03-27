import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateParentProfileDto {
  @ApiPropertyOptional({ example: 'María', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  first_name?: string;

  @ApiPropertyOptional({ example: 'García', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;
}
