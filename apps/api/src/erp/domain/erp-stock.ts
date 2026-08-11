export interface WarehouseStock {
  warehouseCode: string;
  quantity: number;
}

export interface ErpStock {
  productCode: string;
  totalQuantity: number;
  snapshotAt: string;
  warehouses: WarehouseStock[];
}
