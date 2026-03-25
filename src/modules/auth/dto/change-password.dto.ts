import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Actual123!' })
  @IsString()
  current_password: string;

  @ApiProperty({ example: 'Nueva123!', minLength: 8, maxLength: 64 })
  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(64)
  new_password: string;
}
