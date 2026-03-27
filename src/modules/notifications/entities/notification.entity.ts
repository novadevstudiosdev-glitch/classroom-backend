import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type NotificationTargetRole = 'student' | 'teacher' | 'parent' | 'all';

@Entity('notifications')
@Index(['target_role'])
@Index(['created_at'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 20, default: 'all' })
  target_role: NotificationTargetRole;

  @Column({ nullable: true })
  created_by: string; // admin User.id

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
