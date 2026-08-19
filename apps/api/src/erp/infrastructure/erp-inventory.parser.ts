import { ErpStock, WarehouseStock } from '../domain/erp-stock';
import { ErpInventorySnapshot } from '../domain/erp-inventory-snapshot';

interface InventoryAccumulator {
  snapshotAt: string;
  warehouses: Map<string, number>;
}

export function parseInventoryForProducts(
  payload: unknown,
  requestedCodes: readonly string[],
): ErpStock[] {
  if (!Array.isArray(payload)) {
    throw new TypeError('ERP inventory response must be an array');
  }

  const normalizedCodes = new Map(
    requestedCodes.map((code) => [normalizeCode(code), code.trim()]),
  );
  const inventory = new Map<string, InventoryAccumulator>();
  let snapshotAt: string | null = null;

  for (const [index, value] of payload.entries()) {
    if (!isRecord(value)) {
      throw new TypeError(`ERP inventory row ${index} must be an object`);
    }

    const productCode = requiredString(value, 'codigoProducto', index);
    const normalizedCode = normalizeCode(productCode);
    const rowSnapshotAt = requiredString(value, 'fecha', index);
    snapshotAt ??= rowSnapshotAt;

    if (!normalizedCodes.has(normalizedCode)) {
      continue;
    }

    const warehouseCode = requiredString(value, 'codigoBodega', index);
    const quantity = requiredNumber(value, 'invInicial', index);
    const accumulator = inventory.get(normalizedCode) ?? {
      snapshotAt: rowSnapshotAt,
      warehouses: new Map<string, number>(),
    };

    accumulator.warehouses.set(
      warehouseCode,
      (accumulator.warehouses.get(warehouseCode) ?? 0) + quantity,
    );
    inventory.set(normalizedCode, accumulator);
  }

  if (snapshotAt === null) {
    snapshotAt = new Date().toISOString();
  }

  return requestedCodes.map((requestedCode) => {
    const normalizedCode = normalizeCode(requestedCode);
    const accumulator = inventory.get(normalizedCode);
    const warehouses: WarehouseStock[] = accumulator
      ? [...accumulator.warehouses.entries()].map(
          ([warehouseCode, quantity]) => ({
            warehouseCode,
            quantity,
          }),
        )
      : [];

    return {
      productCode: normalizedCodes.get(normalizedCode) ?? requestedCode.trim(),
      totalQuantity: warehouses.reduce(
        (total, item) => total + item.quantity,
        0,
      ),
      snapshotAt: accumulator?.snapshotAt ?? snapshotAt,
      warehouses,
    };
  });
}

export function parseInventorySnapshot(payload: unknown): ErpInventorySnapshot {
  if (!Array.isArray(payload)) {
    throw new TypeError('ERP inventory response must be an array');
  }

  const productCodes = new Set<string>();
  for (const [index, value] of payload.entries()) {
    if (!isRecord(value)) {
      throw new TypeError(`ERP inventory row ${index} must be an object`);
    }
    productCodes.add(requiredString(value, 'codigoProducto', index));
  }

  const stocks = parseInventoryForProducts(payload, [...productCodes]);
  return {
    version: 1,
    fetchedAt: new Date().toISOString(),
    stocks: Object.fromEntries(
      stocks.map((stock) => [normalizeCode(stock.productCode), stock]),
    ),
  };
}

function requiredString(
  value: Record<string, unknown>,
  field: string,
  index: number,
): string {
  const result = value[field];
  if (typeof result !== 'string' || result.trim().length === 0) {
    throw new TypeError(`ERP inventory ${index}.${field} must be a string`);
  }

  return result.trim();
}

function requiredNumber(
  value: Record<string, unknown>,
  field: string,
  index: number,
): number {
  const result = value[field];
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new TypeError(`ERP inventory ${index}.${field} must be a number`);
  }

  return result;
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('en-US');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
