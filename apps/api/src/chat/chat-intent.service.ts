import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiFailoverService } from '../ai/ai-failover.service';
import { ChatConversationContext, ChatMessage } from './domain/chat-session';

export type ChatIntent =
  | 'greeting'
  | 'product_search'
  | 'technical_specs'
  | 'stock_check'
  | 'replacement'
  | 'datasheet'
  | 'out_of_scope';

export interface ParsedChatIntent {
  intent: ChatIntent;
  searchTerm: string;
  productCode: string | null;
  conversationAction: ConversationAction | null;
}

export type ConversationAction =
  | {
      type: 'show_similar';
      searchTerm: string | null;
      excludedCodes: string[];
    }
  | { type: 'same_brand'; brandName: string; excludedCodes: string[] }
  | { type: 'exclude'; productCode: string }
  | { type: 'compare'; productCodes: string[] };

export interface IntentResult extends ParsedChatIntent {
  provider: 'gemini' | 'openai' | 'deterministic';
  model: string;
}

const ALLOWED_INTENTS = new Set<ChatIntent>([
  'greeting',
  'product_search',
  'technical_specs',
  'stock_check',
  'replacement',
  'datasheet',
  'out_of_scope',
]);

@Injectable()
export class ChatIntentService {
  constructor(private readonly ai: AiFailoverService) {}

  async classify(
    messages: readonly ChatMessage[],
    context: ChatConversationContext,
  ): Promise<IntentResult> {
    const deterministic = classifyDeterministically(messages, context);
    if (deterministic) {
      return {
        ...deterministic,
        provider: 'deterministic',
        model: 'backend-rules-v1',
      };
    }

    const result = await this.ai.generate({
      systemInstruction: `Interpreta de forma natural la conversación de un asistente informativo para asesores comerciales. El sistema no vende, reserva, cotiza ni procesa pedidos. Responde SOLO JSON válido sin markdown con: intent, searchTerm y productCode. intent debe ser greeting, product_search, technical_specs, stock_check, replacement, datasheet u out_of_scope. Identifica qué objeto está solicitando realmente el asesor, aunque mencione otro producto como contexto. Si solicita un accesorio para un producto anterior, searchTerm describe el accesorio solicitado y productCode es null; no conviertas la consulta en una verificación del producto de referencia. Si solicita otra opción o una alternativa, usa intent replacement y una searchTerm que describa el tipo de producto buscado. productCode solo se usa cuando la respuesta solicitada trata directamente sobre ese SKU. Usa el historial y este contexto autorizado para resolver referencias: ${JSON.stringify(context)}. No inventes códigos, marcas ni productos.`,
      messages: messages.slice(-12).map(({ role, content }) => ({
        role,
        content,
      })),
      temperature: 0,
      maxOutputTokens: 1000,
      responseMimeType: 'application/json',
    });

    return {
      ...parseIntent(result.text),
      provider: result.provider,
      model: result.model,
    };
  }
}

function classifyDeterministically(
  messages: readonly ChatMessage[],
  context: ChatConversationContext,
): ParsedChatIntent | null {
  const latestMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  if (!latestMessage) {
    return null;
  }

  const content = latestMessage.content.trim();
  const action = resolveConversationAction(content, context);
  if (action) {
    return {
      intent: action.type === 'compare' ? 'technical_specs' : 'product_search',
      searchTerm: context.lastSearchTerm ?? '',
      productCode: null,
      conversationAction: action,
    };
  }
  const referencedProduct = resolveProductReference(content, context);
  if (referencedProduct && isDirectProductReferenceQuery(content)) {
    return {
      intent: 'stock_check',
      searchTerm: context.lastSearchTerm ?? referencedProduct.name,
      productCode: referencedProduct.code,
      conversationAction: null,
    };
  }
  const explicitProductCode = extractExplicitProductCode(content);
  if (explicitProductCode) {
    return {
      intent: /\b(stock|existencias?|disponibilidad|disponible)\b/iu.test(
        content,
      )
        ? 'stock_check'
        : 'product_search',
      searchTerm: explicitProductCode,
      productCode: explicitProductCode,
      conversationAction: null,
    };
  }
  const brandMatch = content.match(
    /\bmarca\s+(?:\[|["'])?([\p{L}\p{N}][\p{L}\p{N}._-]{1,49})(?:\]|["'])?/iu,
  );
  if (brandMatch?.[1]) {
    return {
      intent: 'product_search',
      searchTerm: brandMatch[1],
      productCode: null,
      conversationAction: null,
    };
  }

  const productSearch = extractProductSearch(content);
  if (productSearch) {
    return {
      intent: /\b(stock|existencias?|disponibilidad|disponible)\b/iu.test(
        content,
      )
        ? 'stock_check'
        : 'product_search',
      searchTerm: productSearch,
      productCode: null,
      conversationAction: null,
    };
  }

  if (
    /^(hola|buenos dias|buenas tardes|buenas noches)[!.\s]*$/iu.test(content)
  ) {
    return {
      intent: 'greeting',
      searchTerm: '',
      productCode: null,
      conversationAction: null,
    };
  }

  return null;
}

function extractExplicitProductCode(content: string): string | null {
  const match = content.match(
    /\b(?:sku|c[oó]digo|stock\s+(?:de|del))\s*[:#-]?\s*([\p{L}\p{N}][\p{L}\p{N}._/-]{1,99})\b/iu,
  );
  return match?.[1]?.trim() ?? null;
}

function extractProductSearch(content: string): string | null {
  const normalized = content
    .replace(/[¿?¡!]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const patterns = [
    /^(?:mu[eé]strame|muestra|busca|buscar|consulta|consultar|dame|quiero\s+ver)\s+(?:los?\s+|unos?\s+)?productos?\s+(?:de\s+|con\s+)?(.+)$/iu,
    /^(?:qu[eé]|cu[aá]les?)\s+productos?\s+(?:hay|tienen|tienes|est[aá]n)\s+(?:con\s+)?(?:stock|disponibles?|disponibilidad)?\s*(?:de\s+|para\s+|con\s+)?(.+)$/iu,
    /^(?:hay|tienes)\s+(?:productos?\s+)?(?:con\s+)?(?:stock|disponibles?|disponibilidad)\s+(?:de\s+|para\s+)?(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const term = normalized
      .match(pattern)?.[1]
      ?.replace(/^(?:la\s+marca|marca)\s+/iu, '')
      .trim();
    if (term && term.length >= 2) return term.slice(0, 200);
  }
  return null;
}

function resolveConversationAction(
  content: string,
  context: ChatConversationContext,
): ConversationAction | null {
  const normalized = normalizeConversationText(content);
  const shown = context.lastShownProducts;

  if (/\b(otros?|mas)\s+(parecidos?|similares?)\b/u.test(normalized)) {
    return {
      type: 'show_similar',
      searchTerm: null,
      excludedCodes: shown.map(({ code }) => code),
    };
  }
  if (/^(?:(?:dame|muestrame)\s+)?otra(?:\s+opcion)?$/u.test(normalized)) {
    return {
      type: 'show_similar',
      searchTerm: null,
      excludedCodes: shown.map(({ code }) => code),
    };
  }
  if (/\b(solo|solamente)\s+(de\s+)?la\s+misma\s+marca\b/u.test(normalized)) {
    const selected =
      shown.find(({ code }) => code === context.selectedProductCode) ??
      shown[0];
    return selected
      ? {
          type: 'same_brand',
          brandName: selected.brandName,
          excludedCodes: shown.map(({ code }) => code),
        }
      : null;
  }
  if (/\b(descarta|quita|elimina)\b/u.test(normalized)) {
    const product = resolveProductReference(normalized, context);
    return product ? { type: 'exclude', productCode: product.code } : null;
  }
  if (/\b(compara|comparar|comparame)\b/u.test(normalized)) {
    const productCodes = referencedOrdinals(normalized, context);
    return productCodes.length >= 2
      ? { type: 'compare', productCodes: productCodes.slice(0, 3) }
      : null;
  }
  return null;
}

function isDirectProductReferenceQuery(content: string): boolean {
  const normalized = normalizeConversationText(content)
    .replace(/[¿?¡!.,]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return (
    /\b(stock|existencias?|disponibilidad|disponible|unidades?|especificaciones?|caracteristicas?|ficha\s+tecnica)\b/u.test(
      normalized,
    ) ||
    /^(?:y\s+)?(?:el\s+)?(?:primero|segundo|tercero|cuarto|quinto)$/u.test(
      normalized,
    )
  );
}

function referencedOrdinals(
  content: string,
  context: ChatConversationContext,
): string[] {
  const patterns: Array<[RegExp, number]> = [
    [/\bprimer[oa]?\b/u, 0],
    [/\bsegund[oa]?\b/u, 1],
    [/\btercer[oa]?\b/u, 2],
    [/\bcuart[oa]?\b/u, 3],
    [/\bquint[oa]?\b/u, 4],
  ];
  return patterns
    .filter(([pattern]) => pattern.test(content))
    .map(([, index]) => context.lastShownProducts[index]?.code)
    .filter((code): code is string => code !== undefined);
}

function resolveProductReference(
  content: string,
  context: ChatConversationContext,
) {
  const normalized = normalizeConversationText(content);
  const ordinalIndex = ordinalReferenceIndex(normalized);
  if (ordinalIndex !== null) {
    return context.lastShownProducts[ordinalIndex] ?? null;
  }

  if (/\b(el que tiene mas stock|el de mayor stock)\b/u.test(normalized)) {
    return (
      [...context.lastShownProducts].sort(
        (left, right) => right.stockQuantity - left.stockQuantity,
      )[0] ?? null
    );
  }

  if (/\b(ese|esa|ese producto|el anterior)\b/u.test(normalized)) {
    return (
      context.lastShownProducts.find(
        (product) => product.code === context.selectedProductCode,
      ) ??
      context.lastShownProducts[0] ??
      null
    );
  }

  return null;
}

function normalizeConversationText(content: string): string {
  return content
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-EC');
}

function ordinalReferenceIndex(content: string): number | null {
  const ordinals: Array<[RegExp, number]> = [
    [/\b(el )?primero\b/u, 0],
    [/\b(el )?segundo\b/u, 1],
    [/\b(el )?tercero\b/u, 2],
    [/\b(el )?cuarto\b/u, 3],
    [/\b(el )?quinto\b/u, 4],
  ];
  return ordinals.find(([pattern]) => pattern.test(content))?.[1] ?? null;
}

function parseIntent(text: string): ParsedChatIntent {
  try {
    const normalized = text
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const value = JSON.parse(normalized) as Record<string, unknown>;
    if (
      typeof value.intent !== 'string' ||
      !ALLOWED_INTENTS.has(value.intent as ChatIntent) ||
      (value.searchTerm !== null && typeof value.searchTerm !== 'string') ||
      (value.productCode !== null && typeof value.productCode !== 'string')
    ) {
      throw new TypeError('Invalid intent fields');
    }

    return {
      intent: value.intent as ChatIntent,
      searchTerm:
        typeof value.searchTerm === 'string'
          ? value.searchTerm.trim().slice(0, 200)
          : '',
      productCode: value.productCode?.trim().slice(0, 100) || null,
      conversationAction: null,
    };
  } catch (error) {
    throw new ServiceUnavailableException('AI intent response was invalid', {
      cause: error,
    });
  }
}
