import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsDateString } from 'class-validator';

export class AssignLessonDto {
  @ApiProperty({ example: 'uuid-de-la-clase' })
  @IsUUID()
  classroom_id: string;

  @ApiPropertyOptional({ example: '2026-03-25T23:59:00.000Z' })
  @IsOptional()
  @IsDateString()
  due_date?: string;
}
