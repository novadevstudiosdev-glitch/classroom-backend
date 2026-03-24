import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lesson } from '../../lessons/entities/lesson.entity';

export type ExerciseType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'true_false'
  | 'match_columns'
  | 'order_items';

@Entity('exercises')
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  lesson_id: string;

  @ManyToOne(() => Lesson, (lesson) => lesson.exercises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson: Lesson;

  @Column({ type: 'varchar', length: 30 })
  type: ExerciseType;

  @Column({ default: 0 })
  order: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'jsonb', default: {} })
  content_json: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
