import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, Length, Matches } from 'class-validator';

export class RegisterChildDto {
  @ApiProperty({ example: 'ABC123' })
  @IsString()
  @Length(6, 6)
  invite_code!: string;

  @ApiProperty({ example: 'Sofi' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  alias!: string;

  @ApiPropertyOptional({ example: 'avatar_02' })
  @IsOptional()
  @IsString()
  avatar_id?: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'El PIN debe ser exactamente 4 dígitos numéricos.' })
  device_pin?: string;
}
