import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'juan@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: 'Token de reCAPTCHA (requerido en producción)' })
  @IsString()
  @IsOptional()
  recaptcha_token?: string;
}
