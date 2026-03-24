import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';
import { Classroom } from '../../classrooms/entities/classroom.entity';

@Entity('lesson_assignments')
export class LessonAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  lesson_id: string;

  @ManyToOne(() => Lesson, (lesson) => lesson.assignments)
  @JoinColumn({ name: 'lesson_id' })
  lesson: Lesson;

  @Column()
  classroom_id: string;

  @ManyToOne(() => Classroom)
  @JoinColumn({ name: 'classroom_id' })
  classroom: Classroom;

  @Column({ nullable: true, type: 'timestamptz' })
  due_date: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  assigned_at: Date;
}
