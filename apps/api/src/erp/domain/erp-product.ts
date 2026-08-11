export interface ErpProduct {
  recordNumber: number;
  code: string;
  companyCode: string;
  name: string;
  barcode: string | null;
  weight: number | null;
  classificationCode: string | null;
  classificationName: string | null;
  departmentCode: string;
  departmentName: string;
  lineCode: string;
  lineName: string;
  brandCode: string;
  brandName: string;
  unitCode: string;
  unitName: string;
  productTypeCode: string;
  productType: string;
  origin: string | null;
  blocked: boolean | null;
  lastCostDate: string | null;
}

export interface ErpCatalogEnvelope {
  version: 1;
  fetchedAt: string;
  products: ErpProduct[];
}
