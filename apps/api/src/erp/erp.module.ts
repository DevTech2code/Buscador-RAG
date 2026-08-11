import { Module } from '@nestjs/common';
import { ErpCatalogService } from './erp-catalog.service';
import { ErpController } from './erp.controller';
import { ErpInventoryService } from './erp-inventory.service';
import { ErpCircuitBreaker } from './infrastructure/erp-circuit-breaker';
import { ErpConcurrencyLimiter } from './infrastructure/erp-concurrency-limiter';
import { ErpHttpClient } from './infrastructure/erp-http.client';

@Module({
  controllers: [ErpController],
  providers: [
    ErpCatalogService,
    ErpInventoryService,
    ErpCircuitBreaker,
    ErpConcurrencyLimiter,
    ErpHttpClient,
  ],
  exports: [ErpCatalogService, ErpInventoryService],
})
export class ErpModule {}
