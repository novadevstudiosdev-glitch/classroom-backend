import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export type ParentStudentStatus = 'pending' | 'confirmed' | 'rejected';

@Entity('parent_students')
@Unique(['parent_id', 'student_id'])
export class ParentStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  parent_id: string;

  @Column()
  student_id: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ParentStudentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
