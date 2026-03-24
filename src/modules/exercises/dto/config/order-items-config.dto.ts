import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, IsOptional, MaxLength } from 'class-validator';

export class OrderItemsConfigDto {
  @ApiProperty({ example: ['Mezclar ingredientes', 'Hornear', 'Enfriar'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  items: string[];

  @ApiPropertyOptional({ example: 'Ordená los pasos de la receta.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instruction?: string;
}
