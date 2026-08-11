import { Injectable } from '@nestjs/common';
import { ConversationIntent } from './domain/guardrail.types';

export interface ScopeDecision {
  allowed: boolean;
  reorientationMessage: string | null;
}

@Injectable()
export class ConversationScopePolicyService {
  private static readonly REORIENTATION_MESSAGE =
    'Puedo ayudarte con productos del catálogo, especificaciones técnicas, datasheets, disponibilidad y alternativas. ¿Qué producto o requerimiento deseas consultar?';

  evaluate(intent: ConversationIntent): ScopeDecision {
    if (intent === 'out_of_scope') {
      return {
        allowed: false,
        reorientationMessage:
          ConversationScopePolicyService.REORIENTATION_MESSAGE,
      };
    }

    return { allowed: true, reorientationMessage: null };
  }
}
