import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Exercise } from '../../exercises/entities/exercise.entity';
import { LessonAssignment } from './lesson-assignment.entity';

export type LessonStatus = 'draft' | 'published';

@Entity('lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', default: {} })
  content_json: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: LessonStatus;

  @OneToMany(() => Exercise, (exercise) => exercise.lesson, { cascade: true })
  exercises: Exercise[];

  @OneToMany(() => LessonAssignment, (assignment) => assignment.lesson)
  assignments: LessonAssignment[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at: Date;
}
