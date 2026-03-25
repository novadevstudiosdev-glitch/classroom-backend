import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Intenta un GET con key inexistente — si responde (null), Redis está vivo
      // Redis es opcional: si no está configurado, lo reportamos como OK pero deshabilitado.
      if (!this.redisService.isEnabled()) {
        return this.getStatus(key, true, { enabled: false });
      }

      await this.redisService.get('health:ping');
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError('Redis check failed', this.getStatus(key, false, { message: err.message }));
    }
  }
}
