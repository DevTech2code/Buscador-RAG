import { ErpStock } from './erp-stock';

export interface ErpInventorySnapshot {
  version: 1;
  fetchedAt: string;
  stocks: Record<string, ErpStock>;
}

export type InventoryFreshness = 'fresh' | 'stale' | 'expired';

export interface InventorySnapshotLookup {
  stocks: ErpStock[];
  fetchedAt: string;
  ageSeconds: number;
  freshness: InventoryFreshness;
}
