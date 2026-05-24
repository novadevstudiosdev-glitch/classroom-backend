import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 255 })
  password_hash!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: UserRole;

  @Column({ default: false })
  is_verified!: boolean;

  @Column({ nullable: true, length: 255 })
  verification_token!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verification_token_expires_at!: Date | null;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  refresh_token_hash!: string | null;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  password_reset_token!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  password_reset_token_expires_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}

