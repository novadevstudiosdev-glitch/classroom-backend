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

export type PlanType = 'free' | 'pro' | 'school';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled';

@Entity('teacher_profiles')
export class TeacherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  first_name: string;

  @Column({ length: 50 })
  last_name: string;

  @Column({ length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  plan_type: PlanType;

  @Column({ type: 'varchar', length: 20, default: 'inactive' })
  subscription_status: SubscriptionStatus;

  @Column({ nullable: true, length: 255 })
  avatar_url: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
