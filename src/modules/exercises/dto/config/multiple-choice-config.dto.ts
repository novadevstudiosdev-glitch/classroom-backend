import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsInt, Min, ArrayMinSize, MaxLength } from 'class-validator';

export class MultipleChoiceConfigDto {
  @ApiProperty({ example: '¿Cuántos planetas hay en el sistema solar?' })
  @IsString()
  @MaxLength(500)
  question: string;

  @ApiProperty({ example: ['6', '7', '8', '9'], minItems: 2 })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  options: string[];

  @ApiProperty({ example: 2, description: 'Índice (0-based) de la opción correcta' })
  @IsInt()
  @Min(0)
  correct_index: number;
}
