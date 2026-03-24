import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignMinigameInstanceDto {
  @ApiProperty({ description: 'ID del salón al que se asigna el minijuego' })
  @IsUUID()
  classroom_id: string;
}
