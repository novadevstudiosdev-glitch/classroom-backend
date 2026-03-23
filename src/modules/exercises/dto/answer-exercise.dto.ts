import { IsArray, IsBoolean, IsInt, IsString, IsUUID, Min, ArrayMinSize, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── DTOs por tipo ────────────────────────────────────────

export class MultipleChoiceAnswerDto {
  @ApiProperty({ example: 2, description: 'Índice (0-based) de la opción seleccionada' })
  @IsInt()
  @Min(0)
  selected_index: number;
}

export class FillBlankAnswerDto {
  @ApiProperty({
    example: ['azul', 'amarillo'],
    description: 'Respuestas en el mismo orden que los ___ del texto',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  answers: string[];
}

export class TrueFalseAnswerDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  answer: boolean;
}

export class MatchPairAnswerDto {
  @ApiProperty({ example: 0, description: 'Índice del elemento de la columna izquierda' })
  @IsInt()
  @Min(0)
  left_index: number;

  @ApiProperty({ example: 1, description: 'Índice del elemento de la columna derecha que el alumno asoció' })
  @IsInt()
  @Min(0)
  right_index: number;
}

export class MatchColumnsAnswerDto {
  @ApiProperty({
    type: [MatchPairAnswerDto],
    example: [
      { left_index: 0, right_index: 1 },
      { left_index: 1, right_index: 0 },
    ],
    description: 'Pares que el alumno formó. Debe tener la misma cantidad que los pares del ejercicio.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => MatchPairAnswerDto)
  pairs: MatchPairAnswerDto[];
}

export class OrderItemsAnswerDto {
  @ApiProperty({
    example: [2, 0, 1],
    description: 'Índices de los ítems en el orden que eligió el alumno',
  })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(2)
  order: number[];
}

// ─── DTO principal ────────────────────────────────────────

export class AnswerExerciseDto {
  @ApiProperty({
    description: 'Respuesta del alumno. La estructura depende del tipo de ejercicio:',
    examples: {
      multiple_choice: {
        summary: 'Opción múltiple',
        value: { selected_index: 2 },
      },
      fill_blank: {
        summary: 'Completar espacios',
        value: { answers: ['azul', 'amarillo'] },
      },
      true_false: {
        summary: 'Verdadero o Falso',
        value: { answer: false },
      },
      match_columns: {
        summary: 'Unir columnas',
        value: {
          pairs: [
            { left_index: 0, right_index: 1 },
            { left_index: 1, right_index: 0 },
          ],
        },
      },
      order_items: {
        summary: 'Ordenar elementos',
        value: { order: [2, 0, 1] },
      },
    },
  })
  answer: Record<string, any>;
}

// ─── Tipo de resultado de corrección ─────────────────────

export interface CorrectionResult {
  is_correct: boolean;
  feedback: string;
  correct_answer: Record<string, any>; // siempre se devuelve para que el FE muestre la solución
  detail?: Record<string, any>; // detalle extra para tipos complejos (match, order)
}
