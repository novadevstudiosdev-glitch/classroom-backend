import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  private readonly logThrottleMs = 60_000;
  private hasLoggedInitialConnect = false;
  private lastConnectLogAt = 0;
  private suppressedConnectLogs = 0;
  private lastErrorLogAt = 0;
  private suppressedErrorLogs = 0;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL');
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT') ?? 6379;

    if (!url && !host) {
      this.logger.warn('Redis no configurado — JWT blacklist deshabilitado');
      return;
    }

    const password = this.configService.get<string>('REDIS_PASSWORD');

    if (url) {
      // Upstash u otro proveedor via URL completa
      this.client = new Redis(url);
    } else {
      // Railway Redis — sin TLS, con opciones de estabilidad
      this.client = new Redis({
        host,
        port,
        ...(password ? { password } : {}),
        tls: undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        enableOfflineQueue: false,
      });
    }

    this.client.on('connect', () => {
      const now = Date.now();

      // Primer connect: log a INFO
      if (!this.hasLoggedInitialConnect) {
        this.hasLoggedInitialConnect = true;
        this.lastConnectLogAt = now;
        this.suppressedConnectLogs = 0;
        this.logger.log('Redis conectado');
        return;
      }

      // Reconexiones: throttle para no spamear logs (ej. flapping cada 2s)
      if (now - this.lastConnectLogAt >= this.logThrottleMs) {
        const suppressed = this.suppressedConnectLogs;
        this.suppressedConnectLogs = 0;
        this.lastConnectLogAt = now;
        this.logger.warn(
          `Redis reconectado${suppressed > 0 ? ` (+${suppressed} reconexiones suprimidas)` : ''}`,
        );
      } else {
        this.suppressedConnectLogs += 1;
      }
    });

    this.client.on('error', (err) => {
      const now = Date.now();

      if (now - this.lastErrorLogAt >= this.logThrottleMs) {
        const suppressed = this.suppressedErrorLogs;
        this.suppressedErrorLogs = 0;
        this.lastErrorLogAt = now;

        this.logger.error(
          `Redis error: ${err?.message ?? 'unknown'}${suppressed > 0 ? ` (+${suppressed} errores suprimidos)` : ''}`,
        );
        return;
      }

      this.suppressedErrorLogs += 1;
    });
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
