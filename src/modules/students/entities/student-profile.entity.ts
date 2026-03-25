import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('student_profiles')
export class StudentProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 30 })
  alias: string;

  @Column({ nullable: true, length: 50 })
  avatar_id: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ nullable: true, length: 80 })
  status_message: string;

  @Column({ type: 'date', nullable: true })
  birth_date: string | null;

  // Código de 6 chars para que el padre vincule al alumno
  @Column({ nullable: true, length: 8, unique: true })
  link_code: string;

  @Column({ type: 'int', default: 0 })
  xp_total: number;

  @Column({ type: 'int', default: 1 })
  level: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
