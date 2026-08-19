import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { SearchProductsQueryDto } from './dto/search-products-query.dto';
import { ErpCatalogService } from './erp-catalog.service';
import { ErpInventoryService } from './erp-inventory.service';
import { ErpInventorySnapshotService } from './erp-inventory-snapshot.service';

@Controller('erp')
export class ErpController {
  constructor(
    private readonly catalogService: ErpCatalogService,
    private readonly inventoryService: ErpInventoryService,
    private readonly inventorySnapshot: ErpInventorySnapshotService,
  ) {}

  @Get('products/search')
  search(@Query() query: SearchProductsQueryDto) {
    return this.catalogService.search(query.query, query.limit);
  }

  @Get('products/:code')
  async findByCode(@Param('code') code: string) {
    const product = await this.catalogService.findByCode(code);
    if (!product) {
      throw new NotFoundException(`ERP product ${code} was not found`);
    }

    return product;
  }

  @Get('inventory/:code')
  getLiveStock(@Param('code') code: string) {
    return this.inventoryService.getLiveStock(code);
  }

  @Get('inventory-snapshot/status')
  getInventorySnapshotStatus() {
    return this.inventorySnapshot.status();
  }
}
