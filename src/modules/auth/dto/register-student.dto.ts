import { IsEmail, IsString, IsOptional, MinLength, MaxLength, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterStudentDto {
  @ApiProperty({ example: 'Sofía' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  alias: string;

  @ApiProperty({ example: 'sofia@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @ApiProperty({ example: 'avatar_01' })
  @IsString()
  avatar_id: string;

  @ApiPropertyOptional({ example: 'ABC123', description: 'Código de invitación de 6 caracteres. Si se omite, el alumno se registra sin clase y puede unirse después.' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  invite_code?: string;

  @ApiProperty({ example: 'TOKEN_DE_RECAPTCHA' })
  @IsString()
  recaptcha_token: string;
}
