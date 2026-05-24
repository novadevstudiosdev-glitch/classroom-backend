import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('student_profiles')
export class StudentProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  user_id!: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ length: 30 })
  alias!: string;

  @Column({ type: 'varchar', nullable: true, length: 50 })
  avatar_id!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', nullable: true, length: 80 })
  status_message!: string | null;

  @Column({ type: 'date', nullable: true })
  birth_date!: string | null;

  // Código de 6 chars para que el padre vincule al alumno
  @Column({ type: 'varchar', nullable: true, length: 8, unique: true })
  link_code!: string | null;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  access_code_hash!: string | null; // código de 6 dígitos para entrar desde otro dispositivo

  @Column({ type: 'varchar', nullable: true, length: 255 })
  device_pin_hash!: string | null; // PIN opcional para dispositivos de confianza

  @Column({ default: false })
  require_pin_on_trusted_device!: boolean;

  @Column({ type: 'int', default: 0 })
  xp_total!: number;

  @Column({ type: 'int', default: 1 })
  level!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}


