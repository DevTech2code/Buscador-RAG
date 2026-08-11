import { Injectable } from '@nestjs/common';
import { ErpProduct } from '../erp/domain/erp-product';
import { ErpStock } from '../erp/domain/erp-stock';
import {
  ApprovedProductCandidate,
  OpenSearchDecision,
  ProductCandidate,
  ProductDecision,
} from './domain/guardrail.types';
import { PolicyViolationError } from './domain/policy-violation.error';

interface ExactProductDecisionInput {
  requestedCode: string;
  catalogProduct: ErpProduct | null;
  liveStock: ErpStock | null;
  candidates: readonly ProductCandidate[];
  catalogCodes: ReadonlySet<string>;
  alternativesExplicitlyRequested?: boolean;
}

@Injectable()
export class CatalogStockPolicyService {
  decideExactProduct(input: ExactProductDecisionInput): ProductDecision {
    const requestedCode = normalizeCode(input.requestedCode);

    if (!input.catalogProduct) {
      return {
        outcome: 'not_found',
        requestedCode,
        alternatives: this.approveCandidates(
          input.candidates,
          input.catalogCodes,
          1,
        ),
      };
    }

    this.assertCatalogMembership(input.catalogProduct, input.catalogCodes);
    if (normalizeCode(input.catalogProduct.code) !== requestedCode) {
      throw new PolicyViolationError(
        'The catalog product does not match the requested product',
      );
    }
    if (!input.liveStock) {
      throw new PolicyViolationError(
        'A live stock response is required before making a product decision',
      );
    }
    if (normalizeCode(input.liveStock.productCode) !== requestedCode) {
      throw new PolicyViolationError(
        'The live stock response does not match the requested product',
      );
    }

    if (input.liveStock.totalQuantity > 0) {
      return {
        outcome: 'available',
        product: input.catalogProduct,
        stock: input.liveStock,
        alternatives: input.alternativesExplicitlyRequested
          ? this.approveCandidates(
              input.candidates,
              input.catalogCodes,
              3,
              requestedCode,
            )
          : [],
      };
    }

    return {
      outcome: 'out_of_stock',
      product: input.catalogProduct,
      stock: input.liveStock,
      alternatives: this.approveCandidates(
        input.candidates,
        input.catalogCodes,
        3,
        requestedCode,
      ),
    };
  }

  approveOpenSearch(
    candidates: readonly ProductCandidate[],
    catalogCodes: ReadonlySet<string>,
    maximumResults = 5,
  ): OpenSearchDecision {
    if (maximumResults < 3 || maximumResults > 5) {
      throw new PolicyViolationError(
        'Open searches must return between 3 and 5 results at most',
      );
    }

    return {
      outcome: 'open_search',
      alternatives: this.approveCandidates(
        candidates,
        catalogCodes,
        maximumResults,
      ),
    };
  }

  private approveCandidates(
    candidates: readonly ProductCandidate[],
    catalogCodes: ReadonlySet<string>,
    maximumResults: number,
    excludedCode?: string,
  ): ApprovedProductCandidate[] {
    const normalizedCatalogCodes = new Set(
      [...catalogCodes].map((code) => normalizeCode(code)),
    );
    const seenCodes = new Set<string>();

    return candidates
      .filter((candidate) => {
        const code = normalizeCode(candidate.product.code);
        return (
          normalizedCatalogCodes.has(code) &&
          code !== excludedCode &&
          !seenCodes.has(code) &&
          candidate.product.blocked !== true &&
          candidate.stock.totalQuantity > 0 &&
          normalizeCode(candidate.stock.productCode) === code &&
          Number.isFinite(candidate.equivalenceScore) &&
          candidate.equivalenceScore >= 0 &&
          candidate.equivalenceScore <= 1
        );
      })
      .sort((left, right) => right.equivalenceScore - left.equivalenceScore)
      .filter((candidate) => {
        const code = normalizeCode(candidate.product.code);
        if (seenCodes.has(code)) {
          return false;
        }
        seenCodes.add(code);
        return true;
      })
      .slice(0, maximumResults)
      .map((candidate) => ({ ...candidate, approvedByPolicy: true }));
  }

  private assertCatalogMembership(
    product: ErpProduct,
    catalogCodes: ReadonlySet<string>,
  ): void {
    const normalizedCatalogCodes = new Set(
      [...catalogCodes].map((code) => normalizeCode(code)),
    );
    if (!normalizedCatalogCodes.has(normalizeCode(product.code))) {
      throw new PolicyViolationError(
        'The requested product is not present in the official ERP catalog',
      );
    }
  }
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('en-US');
}
