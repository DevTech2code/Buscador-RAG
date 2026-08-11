import { ErpProduct } from '../domain/erp-product';

type UnknownRecord = Record<string, unknown>;

export function parseErpProducts(payload: unknown): ErpProduct[] {
  if (!Array.isArray(payload)) {
    throw new TypeError('ERP products response must be an array');
  }

  return payload.map((item, index) => parseErpProduct(item, index));
}

function parseErpProduct(value: unknown, index: number): ErpProduct {
  if (!isRecord(value)) {
    throw new TypeError(`ERP product at index ${index} must be an object`);
  }

  return {
    recordNumber: requiredNumber(value, 'nroRegistro', index),
    code: requiredString(value, 'codigoProducto', index),
    companyCode: requiredString(value, 'codigoEmpresa', index),
    name: requiredString(value, 'nombreProducto', index),
    barcode: nullableString(value, 'codigoBarrasProducto', index),
    weight: nullableNumber(value, 'pesoProducto', index),
    classificationCode: nullableString(
      value,
      'codigoClasificacionProducto',
      index,
    ),
    classificationName: nullableString(
      value,
      'nombreClasificacionProducto',
      index,
    ),
    departmentCode: requiredString(value, 'codigoDepartamentoProducto', index),
    departmentName: requiredString(value, 'nombreDepartamentoProducto', index),
    lineCode: requiredString(value, 'codigoLineaProducto', index),
    lineName: requiredString(value, 'nombreLineaProducto', index),
    brandCode: requiredString(value, 'codigoMarcaProducto', index),
    brandName: requiredString(value, 'nombreMarcaProducto', index),
    unitCode: requiredString(value, 'codigoMedidaProducto', index),
    unitName: requiredString(value, 'nombreMedidaProducto', index),
    productTypeCode: requiredString(value, 'codigoTipoProducto', index),
    productType: requiredString(value, 'tipoProducto', index),
    origin: nullableString(value, 'origenProducto', index),
    blocked: parseBlocked(value.indBloqueadoProducto, index),
    lastCostDate: nullableString(value, 'ultimaFechacosto', index),
  };
}

function requiredString(
  value: UnknownRecord,
  field: string,
  index: number,
): string {
  const result = value[field];
  if (typeof result !== 'string' || result.trim().length === 0) {
    throw new TypeError(
      `ERP product ${index}.${field} must be a non-empty string`,
    );
  }

  return result.trim();
}

function nullableString(
  value: UnknownRecord,
  field: string,
  index: number,
): string | null {
  const result = value[field];
  if (result === null || result === undefined) {
    return null;
  }
  if (typeof result !== 'string') {
    throw new TypeError(
      `ERP product ${index}.${field} must be a string or null`,
    );
  }

  return result.trim() || null;
}

function requiredNumber(
  value: UnknownRecord,
  field: string,
  index: number,
): number {
  const result = value[field];
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new TypeError(
      `ERP product ${index}.${field} must be a finite number`,
    );
  }

  return result;
}

function nullableNumber(
  value: UnknownRecord,
  field: string,
  index: number,
): number | null {
  const result = value[field];
  if (result === null || result === undefined) {
    return null;
  }
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new TypeError(
      `ERP product ${index}.${field} must be a number or null`,
    );
  }

  return result;
}

function parseBlocked(value: unknown, index: number): boolean | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value === true || value === 1 || value === '1' || value === 'S') {
    return true;
  }
  if (value === false || value === 0 || value === '0' || value === 'N') {
    return false;
  }

  throw new TypeError(
    `ERP product ${index}.indBloqueadoProducto has an unsupported value`,
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
