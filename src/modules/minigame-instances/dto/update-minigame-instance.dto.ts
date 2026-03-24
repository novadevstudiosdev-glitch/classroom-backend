import { IsString, IsOptional, IsArray, IsObject, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMinigameInstanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  content_json?: Record<string, any>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config_json?: Record<string, any>;
}
