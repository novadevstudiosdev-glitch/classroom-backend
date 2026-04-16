import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Classroom } from './classroom.entity';
import { StudentProfile } from '../../students/entities/student-profile.entity';

@Entity('classroom_students')
@Unique(['classroom_id', 'student_id'])
@Index(['student_id'])
@Index(['classroom_id'])
export class ClassroomStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  classroom_id: string;

  @Column()
  student_id: string;

  @ManyToOne(() => Classroom, (c) => c.classroom_students)
  @JoinColumn({ name: 'classroom_id' })
  classroom: Classroom;

  @ManyToOne(() => StudentProfile)
  @JoinColumn({ name: 'student_id' })
  student: StudentProfile;

  @Column({ type: 'timestamptz', nullable: true })
  last_activity: Date;

  @Column({ type: 'timestamptz', nullable: true })
  left_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  joined_at: Date;
}
