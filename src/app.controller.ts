import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check — verifica que el servidor esté activo' })
  @ApiResponse({ status: 200, description: 'Servidor funcionando correctamente.' })
  getHealth() {
    return this.appService.getHealth();
  }
}

