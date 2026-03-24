import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, ArrayMinSize, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class MatchPairDto {
  @ApiProperty({ example: 'Perro' })
  @IsString()
  left: string;

  @ApiProperty({ example: 'Dog' })
  @IsString()
  right: string;
}

export class MatchColumnsConfigDto {
  @ApiProperty({ type: [MatchPairDto], example: [{ left: 'Perro', right: 'Dog' }, { left: 'Gato', right: 'Cat' }] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(2)
  @Type(() => MatchPairDto)
  pairs: MatchPairDto[];
}
