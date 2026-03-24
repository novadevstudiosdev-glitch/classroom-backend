import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL');
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT') ?? 6379;

    if (!url && !host) {
      this.logger.warn('Redis no configurado — JWT blacklist deshabilitado');
      return;
    }

    this.client = url ? new Redis(url) : new Redis({ host, port });

    this.client.on('connect', () => this.logger.log('Redis conectado'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client || ttlSeconds <= 0) return;
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  isEnabled(): boolean {
    return this.client !== null;
  }
}
