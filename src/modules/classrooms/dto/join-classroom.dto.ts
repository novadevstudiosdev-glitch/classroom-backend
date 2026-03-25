import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinClassroomDto {
  @ApiProperty({ example: 'ABC123', description: 'Código de invitación de 6 caracteres que da el docente.' })
  @IsString()
  @Length(6, 6)
  invite_code: string;
}
