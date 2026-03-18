import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('parent_students')
@Unique(['parent_id', 'student_id'])
export class ParentStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  parent_id: string;

  @Column()
  student_id: string;

  @Column({ default: false })
  is_confirmed: boolean;

  @Column({ nullable: true, length: 255 })
  confirmation_token: string;

  @Column({ type: 'timestamptz', nullable: true })
  confirmation_token_expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
