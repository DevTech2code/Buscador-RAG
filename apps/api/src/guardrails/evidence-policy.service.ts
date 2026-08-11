import { Injectable } from '@nestjs/common';
import { TechnicalEvidence } from './domain/guardrail.types';
import { PolicyViolationError } from './domain/policy-violation.error';

@Injectable()
export class EvidencePolicyService {
  approve(evidence: readonly TechnicalEvidence[]): TechnicalEvidence[] {
    return evidence.map((item) => {
      if (
        !item.attribute.trim() ||
        !item.value.trim() ||
        !item.reference.trim()
      ) {
        throw new PolicyViolationError(
          'Technical specifications require a value and a source reference',
        );
      }
      if (item.source !== 'erp' && item.source !== 'datasheet') {
        throw new PolicyViolationError(
          'Technical evidence must come from ERP or an indexed datasheet',
        );
      }

      return { ...item };
    });
  }
}
