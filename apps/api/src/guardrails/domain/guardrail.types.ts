import { ErpProduct } from '../../erp/domain/erp-product';
import { ErpStock } from '../../erp/domain/erp-stock';

export type AllowedSalesIntent =
  | 'product_search'
  | 'technical_specs'
  | 'stock_check'
  | 'replacement'
  | 'datasheet';

export type ConversationIntent = AllowedSalesIntent | 'out_of_scope';

export interface ProductCandidate {
  product: ErpProduct;
  stock: ErpStock;
  equivalenceScore: number;
}

export interface ApprovedProductCandidate extends ProductCandidate {
  approvedByPolicy: true;
}

interface DecisionBase {
  alternatives: ApprovedProductCandidate[];
}

export interface ProductAvailableDecision extends DecisionBase {
  outcome: 'available';
  product: ErpProduct;
  stock: ErpStock;
}

export interface ProductOutOfStockDecision extends DecisionBase {
  outcome: 'out_of_stock';
  product: ErpProduct;
  stock: ErpStock;
}

export interface ProductNotFoundDecision extends DecisionBase {
  outcome: 'not_found';
  requestedCode: string;
}

export interface OpenSearchDecision extends DecisionBase {
  outcome: 'open_search';
}

export type ProductDecision =
  | ProductAvailableDecision
  | ProductOutOfStockDecision
  | ProductNotFoundDecision
  | OpenSearchDecision;

export type EvidenceSource = 'erp' | 'datasheet';

export interface TechnicalEvidence {
  attribute: string;
  value: string;
  source: EvidenceSource;
  reference: string;
}
