import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { MinigameInstance } from './minigame-instance.entity';

@Entity('minigame_instance_assignments')
@Unique(['instance_id', 'classroom_id'])
export class MinigameInstanceAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instance_id: string;

  @ManyToOne(() => MinigameInstance, (i) => i.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance: MinigameInstance;

  @Column()
  classroom_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  assigned_at: Date;
}
