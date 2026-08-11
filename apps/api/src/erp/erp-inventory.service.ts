import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpStock } from './domain/erp-stock';
import { ErpHttpClient } from './infrastructure/erp-http.client';
import { parseInventoryForProducts } from './infrastructure/erp-inventory.parser';

@Injectable()
export class ErpInventoryService {
  private readonly inventoryUrl: string;

  constructor(
    configService: ConfigService,
    private readonly httpClient: ErpHttpClient,
  ) {
    this.inventoryUrl = configService.getOrThrow<string>('ERP_INVENTORY_URL');
  }

  async getLiveStock(productCode: string): Promise<ErpStock> {
    const [stock] = await this.getLiveStockForProducts([productCode]);

    if (!stock) {
      throw new TypeError('ERP stock parser returned no result');
    }

    return stock;
  }

  async getLiveStockForProducts(
    productCodes: readonly string[],
  ): Promise<ErpStock[]> {
    const uniqueCodes = [...new Set(productCodes.map((code) => code.trim()))];
    const payload = await this.httpClient.getJson(this.inventoryUrl);

    return parseInventoryForProducts(payload, uniqueCodes);
  }
}
