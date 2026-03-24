import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { MinigameInstanceAssignment } from './minigame-instance-assignment.entity';

@Entity('minigame_instances')
export class MinigameInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  teacher_id: string; // TeacherProfile.id

  @Column()
  minigame_id: string; // Minigame.id — template base

  @Column({ length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Preguntas/pares/palabras que armó el docente
  @Column({ type: 'jsonb', default: [] })
  content_json: Record<string, any>[];

  // Configuración visual/gameplay: theme, timer, lives, etc.
  @Column({ type: 'jsonb', default: {} })
  config_json: Record<string, any>;

  @Column({ default: false })
  is_public: boolean;

  @OneToMany(() => MinigameInstanceAssignment, (a) => a.instance)
  assignments: MinigameInstanceAssignment[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at: Date;
}
