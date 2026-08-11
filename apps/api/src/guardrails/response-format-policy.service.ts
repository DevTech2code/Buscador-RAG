import { Injectable } from '@nestjs/common';
import { PolicyViolationError } from './domain/policy-violation.error';

@Injectable()
export class ResponseFormatPolicyService {
  assertAdvisorSafeText(response: string): void {
    const trimmed = response.trim();
    if (!trimmed) {
      throw new PolicyViolationError('The advisor response cannot be empty');
    }
    if (trimmed.includes('```')) {
      throw new PolicyViolationError(
        'Code blocks are forbidden in advisor responses',
      );
    }
    if (looksLikeRawJson(trimmed)) {
      throw new PolicyViolationError(
        'Raw JSON is forbidden in advisor responses',
      );
    }
  }
}

function looksLikeRawJson(value: string): boolean {
  if (
    !(value.startsWith('{') && value.endsWith('}')) &&
    !(value.startsWith('[') && value.endsWith(']'))
  ) {
    return false;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
