import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('classroom_students')
@Unique(['classroom_id', 'student_id'])
export class ClassroomStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  classroom_id: string;

  @Column()
  student_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  joined_at: Date;
}
