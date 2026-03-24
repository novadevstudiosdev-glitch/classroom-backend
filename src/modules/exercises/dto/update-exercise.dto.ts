import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { CONFIG_SCHEMA_MAP } from './create-exercise.dto';

@ValidatorConstraint({ async: false })
export class IsValidConfigJsonForUpdate implements ValidatorConstraintInterface {
  private errorMessages: string[] = [];

  validate(value: any, args: ValidationArguments): boolean {
    const dto = args.object as UpdateExerciseDto;
    // If no type provided in the update, skip DTO-level validation (service will handle it)
    if (!dto.type) return true;
    if (!CONFIG_SCHEMA_MAP[dto.type]) return false;

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
    const dto = args.object as UpdateExerciseDto;
    if (this.errorMessages.length > 0) {
      return `config_json inválido para tipo "${dto.type}": ${this.errorMessages.join(', ')}`;
    }
    return `config_json no es válido para el tipo "${dto.type}".`;
  }
}

export class UpdateExerciseDto {
  @ApiPropertyOptional({
    enum: ['multiple_choice', 'fill_blank', 'true_false', 'match_columns', 'order_items'],
  })
  @IsOptional()
  @IsEnum(['multiple_choice', 'fill_blank', 'true_false', 'match_columns', 'order_items'])
  type?: ExerciseType;

  @ApiPropertyOptional({ example: 'Nuevo título del ejercicio', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Configuración del ejercicio según su tipo' })
  @IsOptional()
  @IsObject()
  @Validate(IsValidConfigJsonForUpdate)
  config_json?: Record<string, any>;
}
