import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MinigameInstance } from './minigame-instance.entity';

@Entity('minigame_results')
@Index(['instance_id', 'student_id'])
export class MinigameResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instance_id: string;

  @ManyToOne(() => MinigameInstance)
  @JoinColumn({ name: 'instance_id' })
  instance: MinigameInstance;

  @Column()
  student_id: string; // StudentProfile.id

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'int', default: 0 })
  max_score: number;

  @Column({ type: 'int', default: 0 })
  xp_earned: number;

  @Column({ type: 'int', default: 0 })
  correct_answers: number;

  @Column({ type: 'int', default: 0 })
  total_questions: number;

  @Column({ type: 'int', default: 0 })
  time_taken_seconds: number;

  // Array de { question_id, selected_option_id, is_correct, time_taken_ms, points_earned }
  @Column({ type: 'jsonb', default: [] })
  answers: Record<string, any>[];

  // Snapshot del content_json al momento de jugar (para no perder datos si el docente edita)
  @Column({ type: 'jsonb', default: [] })
  content_snapshot: Record<string, any>[];

  @Column({ default: false })
  is_first_play: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  played_at: Date;
}
