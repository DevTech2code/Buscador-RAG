import { Injectable } from '@nestjs/common';
import { ErpProduct } from '../erp/domain/erp-product';
import { ErpStock } from '../erp/domain/erp-stock';
import { ErpCatalogService } from '../erp/erp-catalog.service';
import { ErpInventoryService } from '../erp/erp-inventory.service';
import { ErpInventorySnapshotService } from '../erp/erp-inventory-snapshot.service';
import type { InventoryFreshness } from '../erp/domain/erp-inventory-snapshot';
import { ConversationScopePolicyService } from '../guardrails/conversation-scope-policy.service';
import { ResponseFormatPolicyService } from '../guardrails/response-format-policy.service';
import { ChatIntentService, IntentResult } from './chat-intent.service';
import { ChatSessionService } from './chat-session.service';
import { ChatConversationContext, ChatSession } from './domain/chat-session';

export interface ChatResponse {
  session: ChatSession;
  reply: string;
  intent: IntentResult['intent'];
  aiProvider: IntentResult['provider'];
  aiModel: string;
  stockCheckedAt: string | null;
  stockSource: 'snapshot' | 'live' | null;
  stockAgeSeconds: number | null;
  stockFreshness: InventoryFreshness | null;
  processingTimeMs: number;
}

export type ChatProgressStage =
  'received' | 'understanding' | 'retrieving' | 'responding';

export interface ChatProgressEvent {
  stage: ChatProgressStage;
  message: string;
}

export type ChatProgressReporter = (
  event: ChatProgressEvent,
) => void | Promise<void>;

interface StockContext {
  stocks: ErpStock[];
  checkedAt: string;
  source: 'snapshot' | 'live';
  ageSeconds: number;
  freshness: InventoryFreshness;
}

interface ReplyResult {
  reply: string;
  stock: StockContext | null;
  contextPatch?: Partial<ChatConversationContext>;
}

@Injectable()
export class ChatOrchestratorService {
  constructor(
    private readonly sessions: ChatSessionService,
    private readonly intents: ChatIntentService,
    private readonly catalog: ErpCatalogService,
    private readonly inventory: ErpInventoryService,
    private readonly inventorySnapshot: ErpInventorySnapshotService,
    private readonly scopePolicy: ConversationScopePolicyService,
    private readonly responsePolicy: ResponseFormatPolicyService,
  ) {}

  async processMessage(
    sessionId: string,
    content: string,
    reportProgress?: ChatProgressReporter,
  ): Promise<ChatResponse> {
    const startedAt = Date.now();
    await reportProgress?.({
      stage: 'received',
      message: 'Mensaje recibido.',
    });
    const withUserMessage = await this.sessions.appendUserMessage(
      sessionId,
      content,
    );
    await reportProgress?.({
      stage: 'understanding',
      message: 'Entendiendo la consulta y su contexto.',
    });
    const intent = await this.intents.classify(
      withUserMessage.messages,
      withUserMessage.context,
    );
    await reportProgress?.({
      stage: 'retrieving',
      message: 'Consultando catálogo y disponibilidad.',
    });
    const result = await this.buildReply(intent, withUserMessage.context);
    this.responsePolicy.assertAdvisorSafeText(result.reply);
    await reportProgress?.({
      stage: 'responding',
      message: 'Preparando la respuesta.',
    });
    const session = await this.sessions.appendAssistantMessage(
      sessionId,
      result.reply,
      result.contextPatch,
    );

    return {
      session,
      reply: result.reply,
      intent: intent.intent,
      aiProvider: intent.provider,
      aiModel: intent.model,
      stockCheckedAt: result.stock?.checkedAt ?? null,
      stockSource: result.stock?.source ?? null,
      stockAgeSeconds: result.stock?.ageSeconds ?? null,
      stockFreshness: result.stock?.freshness ?? null,
      processingTimeMs: Date.now() - startedAt,
    };
  }

  private async buildReply(
    intent: IntentResult,
    context: ChatConversationContext,
  ): Promise<ReplyResult> {
    if (intent.conversationAction) {
      return this.handleConversationAction(intent, context);
    }
    if (intent.intent === 'greeting') {
      return {
        reply:
          '¡Hola! Puedo ayudarte a buscar productos, revisar especificaciones, consultar stock en tiempo real o encontrar un reemplazo. ¿Qué necesitas?',
        stock: null,
      };
    }

    if (intent.intent === 'out_of_scope') {
      const decision = this.scopePolicy.evaluate('out_of_scope');
      return { reply: decision.reorientationMessage!, stock: null };
    }

    if (intent.intent === 'datasheet') {
      return {
        reply:
          'La consulta de datasheets se habilitará cuando terminemos la ingesta desde Google Drive. Mientras tanto puedo revisar catálogo y stock del ERP.',
        stock: null,
      };
    }

    if (intent.productCode) {
      return this.replyForExactProduct(intent.productCode, intent.searchTerm);
    }

    if (!intent.searchTerm) {
      return {
        reply: '¿Qué producto, marca o característica técnica deseas buscar?',
        stock: null,
      };
    }

    if (intent.intent === 'replacement') {
      return this.replyForSearch(
        intent.searchTerm,
        context.lastShownProducts.map(({ code }) => code),
        true,
      );
    }

    return this.replyForSearch(intent.searchTerm);
  }

  private async replyForExactProduct(
    code: string,
    searchTerm: string,
  ): Promise<ReplyResult> {
    const product = await this.catalog.findByCode(code);
    if (!product) {
      const nearby = searchTerm
        ? await this.getAvailableProducts(searchTerm, 3)
        : { items: [], stock: null };
      return {
        reply:
          nearby.items.length > 0
            ? `El código **${escapeMarkdown(code)}** no forma parte del catálogo activo. Opciones cercanas disponibles:\n${formatProducts(nearby.items)}${freshnessNote(nearby.stock)}`
            : `El código **${escapeMarkdown(code)}** no forma parte del catálogo activo. Indícame una característica o categoría para buscar una alternativa autorizada.`,
        stock: nearby.stock,
        contextPatch: contextForProducts(
          searchTerm,
          nearby.items,
          nearby.items[0]?.product.code ?? null,
        ),
      };
    }

    const stockContext = await this.getStocks([product.code]);
    const stock = stockContext.stocks[0];
    if (!stock) {
      throw new TypeError('Stock lookup returned no product');
    }
    if (stock.totalQuantity > 0) {
      return {
        reply: `**${escapeMarkdown(product.name)}** (${escapeMarkdown(product.code)}) tiene **${stock.totalQuantity} unidades** disponibles.${freshnessNote(stockContext)}`,
        stock: stockContext,
        contextPatch: { selectedProductCode: product.code },
      };
    }

    const alternativesResult = searchTerm
      ? await this.getAvailableProducts(searchTerm, 4)
      : { items: [], stock: null };
    const alternatives = alternativesResult.items
      .filter((item) => item.product.code !== product.code)
      .slice(0, 3);
    return {
      reply:
        alternatives.length > 0
          ? `**${escapeMarkdown(product.name)}** está agotado (0 unidades). Alternativas con stock:\n${formatProducts(alternatives)}`
          : `**${escapeMarkdown(product.name)}** está agotado (0 unidades). No encontré todavía una alternativa equivalente con stock; indícame la característica principal que debe conservarse.`,
      stock: alternativesResult.stock ?? stockContext,
      contextPatch: contextForProducts(
        searchTerm,
        alternatives,
        alternatives[0]?.product.code ?? product.code,
      ),
    };
  }

  private async replyForSearch(
    searchTerm: string,
    excludedCodes: readonly string[] = [],
    alternatives = false,
  ): Promise<ReplyResult> {
    const available = await this.getAvailableProducts(
      searchTerm,
      5,
      excludedCodes,
    );
    if (available.items.length === 0) {
      return {
        reply: `No encontré productos con stock para **${escapeMarkdown(searchTerm)}** en el catálogo activo. Puedes darme una marca, categoría o característica más concreta.`,
        stock: available.stock,
        contextPatch: {
          lastSearchTerm: searchTerm,
          lastShownProducts: [],
          selectedProductCode: null,
        },
      };
    }

    return {
      reply: `${alternatives ? 'Encontré estas alternativas del catálogo con disponibilidad' : 'Encontré estas opciones del catálogo con disponibilidad'}:\n${formatProducts(available.items)}${freshnessNote(available.stock)}`,
      stock: available.stock,
      contextPatch: contextForProducts(
        searchTerm,
        available.items,
        available.items[0]?.product.code ?? null,
      ),
    };
  }

  private async getAvailableProducts(
    query: string,
    limit: number,
    excludedCodes: readonly string[] = [],
  ): Promise<{
    items: Array<{ product: ErpProduct; stock: ErpStock }>;
    stock: StockContext | null;
  }> {
    const candidateLimit = Math.max(limit, 50);
    const excluded = new Set(excludedCodes.map(normalizeCode));
    const search = await this.catalog.search(query, candidateLimit);
    if (search.matches.length === 0) {
      return { items: [], stock: null };
    }

    const stockContext = await this.getStocks(
      search.matches.map((product) => product.code),
    );
    const stockByCode = new Map(
      stockContext.stocks.map((stock) => [stock.productCode, stock]),
    );

    const items = search.matches
      .map((product) => ({ product, stock: stockByCode.get(product.code) }))
      .filter(
        (item): item is { product: ErpProduct; stock: ErpStock } =>
          item.stock !== undefined &&
          item.stock.totalQuantity > 0 &&
          !excluded.has(normalizeCode(item.product.code)),
      )
      .slice(0, limit);
    return { items, stock: stockContext };
  }

  private async getStocks(
    productCodes: readonly string[],
  ): Promise<StockContext> {
    const snapshot = await this.inventorySnapshot.lookup(productCodes);
    if (snapshot && snapshot.freshness !== 'expired') {
      return {
        stocks: snapshot.stocks,
        checkedAt: snapshot.fetchedAt,
        source: 'snapshot',
        ageSeconds: snapshot.ageSeconds,
        freshness: snapshot.freshness,
      };
    }

    try {
      const stocks = await this.inventory.getLiveStockForProducts(productCodes);
      return {
        stocks,
        checkedAt: stocks[0]?.snapshotAt ?? new Date().toISOString(),
        source: 'live',
        ageSeconds: 0,
        freshness: 'fresh',
      };
    } catch (error) {
      if (!snapshot) throw error;
      return {
        stocks: snapshot.stocks,
        checkedAt: snapshot.fetchedAt,
        source: 'snapshot',
        ageSeconds: snapshot.ageSeconds,
        freshness: 'expired',
      };
    }
  }

  private async handleConversationAction(
    intent: IntentResult,
    context: ChatConversationContext,
  ): Promise<ReplyResult> {
    const action = intent.conversationAction;
    if (!action) throw new TypeError('Conversation action is required');

    if (action.type === 'exclude') {
      const remaining = context.lastShownProducts.filter(
        ({ code }) => normalizeCode(code) !== normalizeCode(action.productCode),
      );
      return {
        reply:
          remaining.length > 0
            ? `Listo. Excluí ese producto. Opciones restantes:\n${formatReferences(remaining)}`
            : 'Listo. Excluí ese producto y no quedan opciones en la lista actual.',
        stock: null,
        contextPatch: {
          lastShownProducts: remaining,
          selectedProductCode: remaining[0]?.code ?? null,
        },
      };
    }

    if (action.type === 'compare') {
      const products = (
        await Promise.all(
          action.productCodes.map((code) => this.catalog.findByCode(code)),
        )
      ).filter((product): product is ErpProduct => product !== null);
      const stock = await this.getStocks(products.map(({ code }) => code));
      const stockByCode = new Map(
        stock.stocks.map((item) => [normalizeCode(item.productCode), item]),
      );
      const items = products.map((product) => ({
        product,
        stock:
          stockByCode.get(normalizeCode(product.code)) ??
          emptyStock(product.code, stock.checkedAt),
      }));
      return {
        reply: `Comparación informativa:\n${formatComparison(items)}${freshnessNote(stock)}`,
        stock,
        contextPatch: contextForProducts(
          context.lastSearchTerm ?? '',
          items,
          items[0]?.product.code ?? null,
        ),
      };
    }

    const query =
      action.type === 'same_brand'
        ? action.brandName
        : (action.searchTerm ?? context.lastSearchTerm ?? '');
    if (!query) {
      return {
        reply:
          'Indícame primero un producto o una búsqueda para mostrar opciones similares.',
        stock: null,
      };
    }
    const available = await this.getAvailableProducts(
      query,
      5,
      action.excludedCodes,
    );
    if (available.items.length === 0) {
      return {
        reply: 'No encontré más opciones disponibles que cumplan ese criterio.',
        stock: available.stock,
      };
    }
    return {
      reply: `Estas son otras opciones disponibles:\n${formatProducts(available.items)}${freshnessNote(available.stock)}`,
      stock: available.stock,
      contextPatch: contextForProducts(
        query,
        available.items,
        available.items[0]?.product.code ?? null,
      ),
    };
  }
}

function freshnessNote(stock: StockContext | null): string {
  if (!stock) return '';
  if (stock.source === 'live')
    return ' Stock confirmado directamente en Insoft.';
  if (stock.freshness === 'fresh') {
    return ` Stock sincronizado hace ${stock.ageSeconds} segundos.`;
  }
  if (stock.freshness === 'expired') {
    return ` Insoft no respondió; se muestra el último stock conocido, sincronizado hace ${stock.ageSeconds} segundos. Verifica el dato antes de informarlo como actual.`;
  }
  return ` Stock sincronizado hace ${stock.ageSeconds} segundos; solicita una verificación en vivo si necesitas el dato más reciente.`;
}

function contextForProducts(
  searchTerm: string,
  items: Array<{ product: ErpProduct; stock: ErpStock }>,
  selectedProductCode: string | null,
): Partial<ChatConversationContext> {
  return {
    lastSearchTerm: searchTerm || null,
    selectedProductCode,
    lastShownProducts: items.map(({ product, stock }) => ({
      code: product.code,
      name: product.name,
      stockQuantity: stock.totalQuantity,
      brandName: product.brandName,
    })),
  };
}

function formatReferences(
  items: ChatConversationContext['lastShownProducts'],
): string {
  return items
    .map(
      (item, index) =>
        `* ${index + 1}. **${escapeMarkdown(item.name)}** (${escapeMarkdown(item.code)}): ${item.stockQuantity} unidades`,
    )
    .join('\n');
}

function formatComparison(
  items: Array<{ product: ErpProduct; stock: ErpStock }>,
): string {
  return items
    .map(
      ({ product, stock }) =>
        `* **${escapeMarkdown(product.name)}** (${escapeMarkdown(product.code)}): marca ${escapeMarkdown(product.brandName)}, línea ${escapeMarkdown(product.lineName)}, ${stock.totalQuantity} unidades`,
    )
    .join('\n');
}

function emptyStock(productCode: string, snapshotAt: string): ErpStock {
  return { productCode, totalQuantity: 0, snapshotAt, warehouses: [] };
}

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('en-US');
}

function formatProducts(
  items: Array<{ product: ErpProduct; stock: ErpStock }>,
): string {
  return items
    .map(
      ({ product, stock }) =>
        `* **${escapeMarkdown(product.name)}** (${escapeMarkdown(product.code)}): ${stock.totalQuantity} unidades`,
    )
    .join('\n');
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>-]/g, '\\$&');
}
