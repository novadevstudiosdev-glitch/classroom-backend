import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AuditAction =
  | 'suspend_user'
  | 'restore_user'
  | 'delete_user'
  | 'create_minigame'
  | 'update_minigame'
  | 'delete_minigame'
  | 'toggle_minigame'
  | 'unpublish_lesson'
  | 'broadcast_notification';

@Entity('audit_logs')
@Index(['admin_id'])
@Index(['action'])
@Index(['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  admin_id: string; // User.id

  @Column({ length: 60 })
  action: AuditAction;

  @Column({ length: 50, nullable: true })
  target_type: string; // 'user' | 'minigame' | 'lesson' | 'notification'

  @Column({ nullable: true })
  target_id: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
