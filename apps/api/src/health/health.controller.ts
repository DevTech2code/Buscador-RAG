import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  service: string;
  status: 'ok';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
