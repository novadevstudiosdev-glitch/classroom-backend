import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterParentDto {
  @ApiProperty({ example: 'Martín' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  first_name: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  last_name: string;

  @ApiProperty({ example: 'martin@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @ApiPropertyOptional({ example: 'sofia@email.com', description: 'Email del alumno a vincular. Opcional; se puede vincular luego desde el dashboard.' })
  @IsOptional()
  @IsEmail()
  student_email?: string;

  @ApiProperty({ example: 'TOKEN_DE_RECAPTCHA' })
  @IsString()
  recaptcha_token: string;
}
