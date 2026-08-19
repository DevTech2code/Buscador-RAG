import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ErpInventorySnapshotService } from './erp-inventory-snapshot.service';
import { ErpInventoryService } from './erp-inventory.service';

describe('ErpInventorySnapshotService', () => {
  it('returns fresh stock indexed by normalized SKU', async () => {
    const fetchedAt = new Date().toISOString();
    const redis = {
      getJsonOrThrow: jest.fn().mockResolvedValue({
        version: 1,
        fetchedAt,
        stocks: {
          'SKU-1': {
            productCode: 'SKU-1',
            totalQuantity: 25,
            snapshotAt: fetchedAt,
            warehouses: [],
          },
        },
      }),
    };
    const service = new ErpInventorySnapshotService(
      createConfig(),
      redis as unknown as RedisService,
      {} as ErpInventoryService,
    );

    const result = await service.lookup(['sku-1', 'SKU-UNKNOWN']);

    expect(result).toMatchObject({ freshness: 'fresh', ageSeconds: 0 });
    expect(result?.stocks[0]?.totalQuantity).toBe(25);
    expect(result?.stocks[1]?.totalQuantity).toBe(0);
  });

  it('returns null when no shared snapshot exists', async () => {
    const redis = { getJsonOrThrow: jest.fn().mockResolvedValue(null) };
    const service = new ErpInventorySnapshotService(
      createConfig(),
      redis as unknown as RedisService,
      {} as ErpInventoryService,
    );

    await expect(service.lookup(['SKU-1'])).resolves.toBeNull();
  });
});

function createConfig(): ConfigService {
  return new ConfigService({
    ERP_INVENTORY_SYNC_INTERVAL_SECONDS: 30,
    ERP_INVENTORY_FRESH_SECONDS: 60,
    ERP_INVENTORY_STALE_SECONDS: 180,
  });
}
