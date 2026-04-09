import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Unique,
  Index,
} from 'typeorm';

export type LessonProgressStatus = 'in_progress' | 'completed';

@Entity('lesson_progress')
@Unique(['student_id', 'lesson_id'])
@Index(['student_id'])
@Index(['lesson_id'])
export class LessonProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  student_id: string; // StudentProfile.id

  @Column()
  lesson_id: string;

  @Column({ type: 'varchar', length: 20, default: 'in_progress' })
  status: LessonProgressStatus;

  @Column({ type: 'int', default: 0 })
  stars: number; // 0-3

  @Column({ type: 'float', default: 0 })
  score_pct: number; // 0-100

  @Column({ type: 'int', default: 0 })
  xp_earned: number;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  started_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at: Date;
}
