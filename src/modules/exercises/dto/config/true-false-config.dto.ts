import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, MaxLength } from 'class-validator';

export class TrueFalseConfigDto {
  @ApiProperty({ example: 'La Tierra es plana.' })
  @IsString()
  @MaxLength(500)
  statement: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  correct_answer: boolean;
}
