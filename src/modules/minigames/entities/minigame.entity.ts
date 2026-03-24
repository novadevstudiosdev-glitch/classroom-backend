import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('minigames')
export class Minigame {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 60 })
  slug: string;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 60 })
  type: string; // e.g. 'word_runner', 'memory_match', 'quiz_rush'

  @Column({ type: 'jsonb', default: {} })
  config_json: Record<string, any>;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
