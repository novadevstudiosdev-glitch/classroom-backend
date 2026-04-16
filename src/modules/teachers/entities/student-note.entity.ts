import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('student_notes')
@Index(['teacher_id', 'student_id'])
export class StudentNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string; // TeacherProfile.id

  @Column()
  student_id: string; // StudentProfile.id

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
