import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpStock } from './domain/erp-stock';
import { ErpInventorySnapshot } from './domain/erp-inventory-snapshot';
import { ErpHttpClient } from './infrastructure/erp-http.client';
import {
  parseInventoryForProducts,
  parseInventorySnapshot,
} from './infrastructure/erp-inventory.parser';

export interface LiveInventoryRequest {
  getForProducts(productCodes: readonly string[]): Promise<ErpStock[]>;
}

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
    return this.beginLiveInventoryRequest().getForProducts(productCodes);
  }

  beginLiveInventoryRequest(): LiveInventoryRequest {
    const payloadPromise = this.httpClient.getJson(this.inventoryUrl);

    return {
      getForProducts: async (productCodes: readonly string[]) => {
        const uniqueCodes = [
          ...new Set(productCodes.map((code) => code.trim())),
        ];
        const payload = await payloadPromise;

        return parseInventoryForProducts(payload, uniqueCodes);
      },
    };
  }

  async getLiveSnapshot(): Promise<ErpInventorySnapshot> {
    const payload = await this.httpClient.getJson(this.inventoryUrl);
    return parseInventorySnapshot(payload);
  }
}
