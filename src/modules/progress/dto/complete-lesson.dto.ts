import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteLessonDto {
  @ApiProperty({ description: 'Porcentaje de respuestas correctas (0-100)', example: 85 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score_pct: number;
}
