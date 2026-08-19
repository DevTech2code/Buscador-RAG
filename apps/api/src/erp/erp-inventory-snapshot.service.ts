import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import {
  ErpInventorySnapshot,
  InventoryFreshness,
  InventorySnapshotLookup,
} from './domain/erp-inventory-snapshot';
import { ErpInventoryService } from './erp-inventory.service';

@Injectable()
export class ErpInventorySnapshotService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private static readonly SNAPSHOT_KEY = 'erp:inventory:snapshot:v1';
  private static readonly LOCK_KEY = 'erp:inventory:snapshot:refresh:v1';
  private static readonly SNAPSHOT_TTL_SECONDS = 86_400;

  private readonly logger = new Logger(ErpInventorySnapshotService.name);
  private readonly syncIntervalMilliseconds: number;
  private readonly freshSeconds: number;
  private readonly staleSeconds: number;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
    private readonly inventory: ErpInventoryService,
  ) {
    this.syncIntervalMilliseconds =
      config.getOrThrow<number>('ERP_INVENTORY_SYNC_INTERVAL_SECONDS') * 1000;
    this.freshSeconds = config.getOrThrow<number>(
      'ERP_INVENTORY_FRESH_SECONDS',
    );
    this.staleSeconds = config.getOrThrow<number>(
      'ERP_INVENTORY_STALE_SECONDS',
    );
  }

  onApplicationBootstrap(): void {
    void this.synchronize();
  }

  onModuleDestroy(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async lookup(
    productCodes: readonly string[],
  ): Promise<InventorySnapshotLookup | null> {
    const snapshot = await this.redis.getJsonOrThrow<ErpInventorySnapshot>(
      ErpInventorySnapshotService.SNAPSHOT_KEY,
    );
    if (!isInventorySnapshot(snapshot)) {
      return null;
    }

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000),
    );
    const freshness = this.freshness(ageSeconds);
    const stocks = productCodes.map(
      (code) =>
        snapshot.stocks[normalizeCode(code)] ??
        emptyStock(code, snapshot.fetchedAt),
    );

    return { stocks, fetchedAt: snapshot.fetchedAt, ageSeconds, freshness };
  }

  async status(): Promise<{
    ready: boolean;
    fetchedAt: string | null;
    ageSeconds: number | null;
    freshness: InventoryFreshness | null;
    productCount: number;
  }> {
    const snapshot = await this.redis.getJsonOrThrow<ErpInventorySnapshot>(
      ErpInventorySnapshotService.SNAPSHOT_KEY,
    );
    if (!isInventorySnapshot(snapshot)) {
      return {
        ready: false,
        fetchedAt: null,
        ageSeconds: null,
        freshness: null,
        productCount: 0,
      };
    }

    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000),
    );
    return {
      ready: true,
      fetchedAt: snapshot.fetchedAt,
      ageSeconds,
      freshness: this.freshness(ageSeconds),
      productCount: Object.keys(snapshot.stocks).length,
    };
  }

  private async synchronize(): Promise<void> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this.performSynchronization().finally(() => {
      this.syncPromise = null;
      this.syncTimer = setTimeout(() => {
        void this.synchronize();
      }, this.syncIntervalMilliseconds);
      this.syncTimer.unref();
    });
    return this.syncPromise;
  }

  private async performSynchronization(): Promise<void> {
    const lockToken = await this.redis.acquireLock(
      ErpInventorySnapshotService.LOCK_KEY,
      120_000,
    );
    if (!lockToken) {
      this.logger.debug(
        'Inventory synchronization is running in another replica',
      );
      return;
    }

    const startedAt = Date.now();
    try {
      const snapshot = await this.inventory.getLiveSnapshot();
      await this.redis.setJsonOrThrow(
        ErpInventorySnapshotService.SNAPSHOT_KEY,
        snapshot,
        ErpInventorySnapshotService.SNAPSHOT_TTL_SECONDS,
      );
      this.logger.log(
        `Inventory snapshot synchronized with ${Object.keys(snapshot.stocks).length} products in ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Inventory synchronization failed: ${message}`);
    } finally {
      await this.redis.releaseLock(
        ErpInventorySnapshotService.LOCK_KEY,
        lockToken,
      );
    }
  }

  private freshness(ageSeconds: number): InventoryFreshness {
    if (ageSeconds <= this.freshSeconds) return 'fresh';
    if (ageSeconds <= this.staleSeconds) return 'stale';
    return 'expired';
  }
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('en-US');
}

function emptyStock(productCode: string, snapshotAt: string) {
  return { productCode, totalQuantity: 0, snapshotAt, warehouses: [] };
}

function isInventorySnapshot(value: unknown): value is ErpInventorySnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ErpInventorySnapshot>;
  return (
    candidate.version === 1 &&
    typeof candidate.fetchedAt === 'string' &&
    typeof candidate.stocks === 'object' &&
    candidate.stocks !== null
  );
}
