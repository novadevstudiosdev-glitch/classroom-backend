import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmParentLinkDto {
  @ApiProperty({ example: 'TOKEN_DE_VINCULACION', description: 'Token recibido por email para confirmar el vinculo padre-alumno' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
