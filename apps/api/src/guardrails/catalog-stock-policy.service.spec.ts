import { ErpProduct } from '../erp/domain/erp-product';
import { ErpStock } from '../erp/domain/erp-stock';
import { CatalogStockPolicyService } from './catalog-stock-policy.service';
import { ProductCandidate } from './domain/guardrail.types';
import { PolicyViolationError } from './domain/policy-violation.error';

describe('CatalogStockPolicyService', () => {
  const policy = new CatalogStockPolicyService();
  const requestedProduct = createProduct('SKU-1');
  const catalogCodes = new Set(['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5']);

  it('returns only the requested product when it has stock', () => {
    const decision = policy.decideExactProduct({
      requestedCode: 'SKU-1',
      catalogProduct: requestedProduct,
      liveStock: createStock('SKU-1', 10),
      candidates: [createCandidate('SKU-2', 5, 0.9)],
      catalogCodes,
    });

    expect(decision.outcome).toBe('available');
    expect(decision.alternatives).toEqual([]);
  });

  it('allows up to three alternatives when explicitly requested', () => {
    const candidates = [
      createCandidate('SKU-2', 5, 0.7),
      createCandidate('SKU-3', 5, 0.9),
      createCandidate('SKU-4', 5, 0.8),
      createCandidate('SKU-5', 5, 0.6),
    ];
    const decision = policy.decideExactProduct({
      requestedCode: 'SKU-1',
      catalogProduct: requestedProduct,
      liveStock: createStock('SKU-1', 10),
      candidates,
      catalogCodes,
      alternativesExplicitlyRequested: true,
    });

    expect(decision.alternatives.map((item) => item.product.code)).toEqual([
      'SKU-3',
      'SKU-4',
      'SKU-2',
    ]);
  });

  it('filters external, blocked, duplicated and out-of-stock replacements', () => {
    const blocked = createCandidate('SKU-3', 5, 0.95, true);
    const candidates = [
      createCandidate('EXTERNAL-SKU', 10, 1),
      blocked,
      createCandidate('SKU-4', 0, 0.9),
      createCandidate('SKU-2', 3, 0.8),
      createCandidate('SKU-2', 3, 0.7),
    ];
    const decision = policy.decideExactProduct({
      requestedCode: 'SKU-1',
      catalogProduct: requestedProduct,
      liveStock: createStock('SKU-1', 0),
      candidates,
      catalogCodes,
    });

    expect(decision.outcome).toBe('out_of_stock');
    expect(decision.alternatives).toHaveLength(1);
    expect(decision.alternatives[0]?.product.code).toBe('SKU-2');
    expect(decision.alternatives[0]?.approvedByPolicy).toBe(true);
  });

  it('returns only the closest available option for an unknown product', () => {
    const decision = policy.decideExactProduct({
      requestedCode: 'UNKNOWN',
      catalogProduct: null,
      liveStock: null,
      candidates: [
        createCandidate('SKU-2', 2, 0.8),
        createCandidate('SKU-3', 2, 0.9),
      ],
      catalogCodes,
    });

    expect(decision.outcome).toBe('not_found');
    expect(decision.alternatives.map((item) => item.product.code)).toEqual([
      'SKU-3',
    ]);
  });

  it('fails closed when live stock is missing or belongs to another SKU', () => {
    expect(() =>
      policy.decideExactProduct({
        requestedCode: 'SKU-1',
        catalogProduct: requestedProduct,
        liveStock: null,
        candidates: [],
        catalogCodes,
      }),
    ).toThrow(PolicyViolationError);

    expect(() =>
      policy.decideExactProduct({
        requestedCode: 'SKU-1',
        catalogProduct: requestedProduct,
        liveStock: createStock('SKU-2', 5),
        candidates: [],
        catalogCodes,
      }),
    ).toThrow('does not match');
  });

  it('limits open searches to a configurable maximum between three and five', () => {
    const candidates = ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5'].map(
      (code, index) => createCandidate(code, 1, 1 - index * 0.1),
    );

    expect(
      policy.approveOpenSearch(candidates, catalogCodes, 3).alternatives,
    ).toHaveLength(3);
    expect(() => policy.approveOpenSearch(candidates, catalogCodes, 6)).toThrow(
      PolicyViolationError,
    );
  });
});

function createCandidate(
  code: string,
  quantity: number,
  score: number,
  blocked: boolean | null = null,
): ProductCandidate {
  return {
    product: createProduct(code, blocked),
    stock: createStock(code, quantity),
    equivalenceScore: score,
  };
}

function createProduct(
  code: string,
  blocked: boolean | null = null,
): ErpProduct {
  return {
    recordNumber: 1,
    code,
    companyCode: '102',
    name: `Product ${code}`,
    barcode: null,
    weight: null,
    classificationCode: '1',
    classificationName: 'CLASS',
    departmentCode: '1',
    departmentName: 'DEPARTMENT',
    lineCode: '1',
    lineName: 'LINE',
    brandCode: '1',
    brandName: 'BRAND',
    unitCode: 'UNI',
    unitName: 'UNIT',
    productTypeCode: '0',
    productType: 'PRODUCT',
    origin: null,
    blocked,
    lastCostDate: null,
  };
}

function createStock(code: string, quantity: number): ErpStock {
  return {
    productCode: code,
    totalQuantity: quantity,
    snapshotAt: new Date().toISOString(),
    warehouses: quantity > 0 ? [{ warehouseCode: '1', quantity }] : [],
  };
}
