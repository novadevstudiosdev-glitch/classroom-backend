import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuizAnswerItemDto {
  @ApiProperty({ description: 'ID de la pregunta (de content_json)' })
  @IsString()
  question_id: string;

  @ApiProperty({ description: 'ID de la opción seleccionada (null si no respondió a tiempo)', nullable: true })
  @IsOptional()
  @IsString()
  selected_option_id: string | null;

  @ApiProperty({ description: 'Tiempo que tardó en responder esta pregunta, en milisegundos' })
  @IsInt()
  @Min(0)
  time_taken_ms: number;
}

export class SubmitQuizDto {
  @ApiProperty({ type: [QuizAnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerItemDto)
  answers: QuizAnswerItemDto[];

  @ApiProperty({ description: 'Tiempo total que tardó en completar el quiz, en segundos' })
  @IsInt()
  @Min(0)
  time_taken_seconds: number;
}
