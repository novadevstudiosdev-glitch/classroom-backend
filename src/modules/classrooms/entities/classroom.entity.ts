import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TeacherProfile } from '../../teachers/entities/teacher-profile.entity';
import { ClassroomStudent } from './classroom-student.entity';

export type GradeLevel = '1st' | '2nd' | '3rd' | '4th' | '5th' | '6th';
export type ClassroomStatus = 'active' | 'pending' | 'finished';

@Entity('classrooms')
export class Classroom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  grade_level: GradeLevel;

  @Column({ unique: true, length: 6 })
  invite_code: string;

  @Column()
  teacher_id: string;

  @ManyToOne(() => TeacherProfile)
  @JoinColumn({ name: 'teacher_id' })
  teacher: TeacherProfile;

  @OneToMany(() => ClassroomStudent, (cs) => cs.classroom)
  classroom_students: ClassroomStudent[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ClassroomStatus;

  @Column({ default: false })
  is_archived: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
