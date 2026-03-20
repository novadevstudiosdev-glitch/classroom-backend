import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  MaxLength,
  IsObject,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ExerciseType } from '../entities/exercise.entity';
import { MultipleChoiceConfigDto } from './config/multiple-choice-config.dto';
import { FillBlankConfigDto } from './config/fill-blank-config.dto';
import { TrueFalseConfigDto } from './config/true-false-config.dto';
import { MatchColumnsConfigDto } from './config/match-columns-config.dto';
import { OrderItemsConfigDto } from './config/order-items-config.dto';

export const CONFIG_SCHEMA_MAP: Record<ExerciseType, new () => object> = {
  multiple_choice: MultipleChoiceConfigDto,
  fill_blank: FillBlankConfigDto,
  true_false: TrueFalseConfigDto,
  match_columns: MatchColumnsConfigDto,
  order_items: OrderItemsConfigDto,
};

@ValidatorConstraint({ async: false })
export class IsValidConfigJson implements ValidatorConstraintInterface {
  private errorMessages: string[] = [];

  validate(value: any, args: ValidationArguments): boolean {
    const dto = args.object as CreateExerciseDto;
    if (!dto.type || !CONFIG_SCHEMA_MAP[dto.type]) return false;

    const DtoClass = CONFIG_SCHEMA_MAP[dto.type];
    const instance = plainToInstance(DtoClass, value);
    const errors = validateSync(instance as object, { whitelist: true });

    if (errors.length > 0) {
      this.errorMessages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateExerciseDto;
    if (this.errorMessages.length > 0) {
      return `config_json inválido para tipo "${dto.type}": ${this.errorMessages.join(', ')}`;
    }
    return `config_json no es válido para el tipo "${dto.type}".`;
  }
}

export class CreateExerciseDto {
  @ApiProperty({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' })
  @IsString()
  lesson_id: string;

  @ApiProperty({
    enum: ['multiple_choice', 'fill_blank', 'true_false', 'match_columns', 'order_items'],
    example: 'multiple_choice',
  })
  @IsEnum(['multiple_choice', 'fill_blank', 'true_false', 'match_columns', 'order_items'])
  type: ExerciseType;

  @ApiProperty({ example: '¿Cuántos planetas hay en el sistema solar?', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 0, description: 'Posición dentro de la lección' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({
    description: 'Configuración del ejercicio según su tipo',
    examples: {
      multiple_choice: {
        summary: 'multiple_choice',
        value: { question: '¿Cuánto es 2+2?', options: ['2', '3', '4', '5'], correct_index: 2 },
      },
      fill_blank: {
        summary: 'fill_blank',
        value: { text_with_blanks: 'El cielo es ___.', answers: ['azul'] },
      },
      true_false: {
        summary: 'true_false',
        value: { statement: 'La Tierra es redonda.', correct_answer: true },
      },
      match_columns: {
        summary: 'match_columns',
        value: { pairs: [{ left: 'Perro', right: 'Dog' }, { left: 'Gato', right: 'Cat' }] },
      },
      order_items: {
        summary: 'order_items',
        value: { items: ['Paso 1', 'Paso 2', 'Paso 3'], instruction: 'Ordená los pasos.' },
      },
    },
  })
  @IsObject()
  @Validate(IsValidConfigJson)
  config_json: Record<string, any>;
}
