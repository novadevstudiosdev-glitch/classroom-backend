import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Verificar que el backend estÃ¡ levantado (sin chequear dependencias)' })
  @ApiResponse({ status: 200, description: 'Backend operativo.' })
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Verificar estado de la aplicación y sus dependencias' })
  @ApiResponse({ status: 200, description: 'Todos los servicios operativos.' })
  @ApiResponse({ status: 503, description: 'Uno o más servicios con problemas.' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
