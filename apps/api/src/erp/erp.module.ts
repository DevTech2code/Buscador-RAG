import { Module } from '@nestjs/common';
import { ErpCatalogService } from './erp-catalog.service';
import { ErpController } from './erp.controller';
import { ErpInventoryService } from './erp-inventory.service';
import { ErpInventorySnapshotService } from './erp-inventory-snapshot.service';
import { ErpCircuitBreaker } from './infrastructure/erp-circuit-breaker';
import { ErpConcurrencyLimiter } from './infrastructure/erp-concurrency-limiter';
import { ErpHttpClient } from './infrastructure/erp-http.client';

@Module({
  controllers: [ErpController],
  providers: [
    ErpCatalogService,
    ErpInventoryService,
    ErpInventorySnapshotService,
    ErpCircuitBreaker,
    ErpConcurrencyLimiter,
    ErpHttpClient,
  ],
  exports: [
    ErpCatalogService,
    ErpInventoryService,
    ErpInventorySnapshotService,
  ],
})
export class ErpModule {}
