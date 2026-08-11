import { ConfigService } from '@nestjs/config';
import { ErpInventoryService } from './erp-inventory.service';
import { ErpHttpClient } from './infrastructure/erp-http.client';

describe('ErpInventoryService', () => {
  it('always performs a live request and aggregates warehouses', async () => {
    const httpClient = {
      getJson: jest
        .fn()
        .mockResolvedValue([
          createInventoryRow('1', 32),
          createInventoryRow('25', 3),
        ]),
    };
    const service = new ErpInventoryService(
      new ConfigService({
        ERP_INVENTORY_URL: 'http://erp.example/api/inventario',
      }),
      httpClient as unknown as ErpHttpClient,
    );

    const first = await service.getLiveStock('TEC-EC1000-PLUS-W');
    const second = await service.getLiveStock('TEC-EC1000-PLUS-W');

    expect(first.totalQuantity).toBe(35);
    expect(first.warehouses).toHaveLength(2);
    expect(second.totalQuantity).toBe(35);
    expect(httpClient.getJson).toHaveBeenCalledTimes(2);
  });

  it('returns zero when a product is absent from the live snapshot', async () => {
    const httpClient = { getJson: jest.fn().mockResolvedValue([]) };
    const service = new ErpInventoryService(
      new ConfigService({
        ERP_INVENTORY_URL: 'http://erp.example/api/inventario',
      }),
      httpClient as unknown as ErpHttpClient,
    );

    await expect(service.getLiveStock('UNKNOWN-SKU')).resolves.toMatchObject({
      productCode: 'UNKNOWN-SKU',
      totalQuantity: 0,
      warehouses: [],
    });
  });
});

function createInventoryRow(
  warehouseCode: string,
  quantity: number,
): Record<string, unknown> {
  return {
    codigoProducto: 'TEC-EC1000-PLUS-W',
    codigoBodega: warehouseCode,
    invInicial: quantity,
    fecha: '2026-08-11T14:31:22.000+00:00',
  };
}
