import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Length, IsOptional } from 'class-validator';

export class LoginStudentCodeDto {
  @ApiProperty({ example: 'sofi' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  alias!: string;

  @ApiProperty({ example: '847392', description: 'Código de 6 dígitos que el padre comparte' })
  @IsString()
  @Length(6, 6)
  access_code!: string;
}

export class SwitchToChildDto {
  @ApiProperty({ example: 'uuid-del-student-profile' })
  @IsString()
  student_id!: string;

  @ApiPropertyOptional({ example: '1234', description: 'Requerido si require_pin_on_trusted_device está activo' })
  @IsOptional()
  @IsString()
  @Length(4, 4)
  device_pin?: string;
}
