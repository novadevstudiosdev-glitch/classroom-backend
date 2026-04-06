import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { SessionEvent } from '../interfaces/session-event.interface';

@Entity('sessions')
@Index(['student_id'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string; // StudentProfile.id

  @Column({ type: 'uuid', nullable: true })
  classroom_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  lesson_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at: Date | null;

  @Column({ type: 'jsonb', default: [] })
  events: SessionEvent[];
}
