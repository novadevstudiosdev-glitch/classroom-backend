import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ArrayMinSize, MaxLength } from 'class-validator';

export class FillBlankConfigDto {
  @ApiProperty({ example: 'El cielo es ___ y el sol es ___.' })
  @IsString()
  @MaxLength(1000)
  text_with_blanks: string;

  @ApiProperty({ example: ['azul', 'amarillo'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  answers: string[];
}
