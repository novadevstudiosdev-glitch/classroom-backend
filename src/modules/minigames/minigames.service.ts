import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Minigame } from './entities/minigame.entity';

@Injectable()
export class MinigamesService {
  constructor(
    @InjectRepository(Minigame)
    private minigameRepo: Repository<Minigame>,
  ) {}

  async findAll(): Promise<Minigame[]> {
    return this.minigameRepo.find({ where: { is_active: true } });
  }

  async findOne(id: string): Promise<Minigame> {
    const minigame = await this.minigameRepo.findOne({ where: { id, is_active: true } });
    if (!minigame) throw new NotFoundException('Minijuego no encontrado.');
    return minigame;
  }
}
