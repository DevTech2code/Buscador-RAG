import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ErpCatalogEnvelope, ErpProduct } from './domain/erp-product';
import { ErpHttpClient } from './infrastructure/erp-http.client';
import { parseErpProducts } from './infrastructure/erp-product.parser';

export interface ProductSearchResponse {
  fetchedAt: string;
  totalCatalogProducts: number;
  matches: ErpProduct[];
}

@Injectable()
export class ErpCatalogService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private static readonly CACHE_KEY = 'erp:catalog:products:v1';
  private static readonly REFRESH_LOCK_KEY = 'erp:catalog:products:refresh:v1';
  private static readonly CACHE_RETENTION_SECONDS = 86_400;

  private readonly logger = new Logger(ErpCatalogService.name);
  private readonly productsUrl: string;
  private readonly cacheTtlSeconds: number;
  private readonly localCacheTtlMilliseconds: number;
  private readonly warmIntervalMilliseconds: number;

  private localCatalog: ErpCatalogEnvelope | null = null;
  private localCatalogExpiresAt = 0;
  private refreshPromise: Promise<ErpCatalogEnvelope> | null = null;
  private warmTimer: NodeJS.Timeout | null = null;

  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly httpClient: ErpHttpClient,
  ) {
    this.productsUrl = configService.getOrThrow<string>('ERP_PRODUCTS_URL');
    this.cacheTtlSeconds = configService.getOrThrow<number>(
      'ERP_CACHE_TTL_SECONDS',
    );
    this.localCacheTtlMilliseconds =
      configService.getOrThrow<number>('ERP_LOCAL_CACHE_TTL_SECONDS') * 1000;
    this.warmIntervalMilliseconds =
      configService.getOrThrow<number>('ERP_CATALOG_WARM_INTERVAL_SECONDS') *
      1000;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.warmCatalog();
    this.warmTimer = setInterval(() => {
      void this.warmCatalog();
    }, this.warmIntervalMilliseconds);
    this.warmTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.warmTimer) {
      clearInterval(this.warmTimer);
      this.warmTimer = null;
    }
  }

  async search(query: string, limit: number): Promise<ProductSearchResponse> {
    const catalog = await this.getCatalog();
    const normalizedQuery = normalizeSearchText(query);
    const queryTokens = meaningfulTokens(normalizedQuery);
    const rankedMatches: Array<{ product: ErpProduct; score: number }> = [];

    for (const product of catalog.products) {
      const score = productSearchScore(product, normalizedQuery, queryTokens);
      if (score > 0) {
        rankedMatches.push({ product, score });
      }
    }

    const matches = rankedMatches
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ product }) => product);

    return {
      fetchedAt: catalog.fetchedAt,
      totalCatalogProducts: catalog.products.length,
      matches,
    };
  }

  async findByCode(code: string): Promise<ErpProduct | null> {
    const normalizedCode = code.trim().toLocaleUpperCase('en-US');
    const catalog = await this.getCatalog();

    return (
      catalog.products.find(
        (product) => product.code.toLocaleUpperCase('en-US') === normalizedCode,
      ) ?? null
    );
  }

  private async warmCatalog(): Promise<void> {
    const startedAt = Date.now();
    try {
      const catalog = await this.getCatalog();
      this.logger.log(
        `ERP catalog ready with ${catalog.products.length} products in ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`ERP catalog warm-up failed: ${message}`);
    }
  }

  private async getCatalog(): Promise<ErpCatalogEnvelope> {
    if (this.localCatalog && Date.now() < this.localCatalogExpiresAt) {
      return this.localCatalog;
    }

    const sharedCatalog = await this.redisService.getJson<ErpCatalogEnvelope>(
      ErpCatalogService.CACHE_KEY,
    );
    if (
      isCatalogEnvelope(sharedCatalog) &&
      catalogAgeSeconds(sharedCatalog) <= this.cacheTtlSeconds
    ) {
      this.setLocalCatalog(sharedCatalog);
      return sharedCatalog;
    }

    const fallbackCatalog = isCatalogEnvelope(sharedCatalog)
      ? sharedCatalog
      : this.localCatalog;

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshCatalog().finally(() => {
        this.refreshPromise = null;
      });
    }

    try {
      return await this.refreshPromise;
    } catch (error) {
      if (!fallbackCatalog) throw error;
      this.logger.warn(
        'ERP catalog refresh failed; serving the last retained catalog',
      );
      this.setLocalCatalog(fallbackCatalog);
      return fallbackCatalog;
    }
  }

  private async refreshCatalog(): Promise<ErpCatalogEnvelope> {
    const lockTtl = this.httpClient.maximumRequestDurationMilliseconds;
    const lockToken = await this.redisService.acquireLock(
      ErpCatalogService.REFRESH_LOCK_KEY,
      lockTtl,
    );

    if (!lockToken) {
      const refreshedByAnotherReplica =
        await this.redisService.waitForJson<ErpCatalogEnvelope>(
          ErpCatalogService.CACHE_KEY,
          lockTtl,
        );

      if (isCatalogEnvelope(refreshedByAnotherReplica)) {
        this.setLocalCatalog(refreshedByAnotherReplica);
        return refreshedByAnotherReplica;
      }

      this.logger.warn(
        'ERP catalog refresh lock was unavailable; using protected fallback request',
      );
    }

    try {
      const payload = await this.httpClient.getJson(this.productsUrl);
      const products = parseErpProducts(payload);
      const catalog: ErpCatalogEnvelope = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        products,
      };

      await this.redisService.setJson(
        ErpCatalogService.CACHE_KEY,
        catalog,
        Math.max(
          this.cacheTtlSeconds,
          ErpCatalogService.CACHE_RETENTION_SECONDS,
        ),
      );
      this.setLocalCatalog(catalog);

      this.logger.log(`ERP catalog refreshed with ${products.length} products`);
      return catalog;
    } finally {
      if (lockToken) {
        await this.redisService.releaseLock(
          ErpCatalogService.REFRESH_LOCK_KEY,
          lockToken,
        );
      }
    }
  }

  private setLocalCatalog(catalog: ErpCatalogEnvelope): void {
    this.localCatalog = catalog;
    this.localCatalogExpiresAt = Date.now() + this.localCacheTtlMilliseconds;
  }
}

function catalogAgeSeconds(catalog: ErpCatalogEnvelope): number {
  const fetchedAt = Date.parse(catalog.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
}

function isCatalogEnvelope(value: unknown): value is ErpCatalogEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ErpCatalogEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.fetchedAt === 'string' &&
    Array.isArray(candidate.products)
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-EC')
    .trim();
}

const SEARCH_STOP_WORDS = new Set([
  'de',
  'del',
  'el',
  'la',
  'los',
  'las',
  'marca',
  'modelo',
  'producto',
  'productos',
  'con',
  'para',
  'un',
  'una',
]);

function meaningfulTokens(normalizedQuery: string): string[] {
  return [
    ...new Set(
      normalizedQuery
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token)),
    ),
  ];
}

function productSearchScore(
  product: ErpProduct,
  normalizedQuery: string,
  queryTokens: readonly string[],
): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const code = normalizeSearchText(product.code);
  const name = normalizeSearchText(product.name);
  const brand = normalizeSearchText(product.brandName);
  const searchableText = normalizeSearchText(
    [
      product.code,
      product.name,
      product.brandName,
      product.classificationName,
      product.lineName,
    ]
      .filter((value): value is string => value !== null)
      .join(' '),
  );
  const matchedTokens = queryTokens.filter((token) =>
    tokenMatchesText(token, searchableText),
  );
  const nameMatchedTokens = queryTokens.filter((token) =>
    tokenMatchesText(token, name),
  );

  if (matchedTokens.length === 0) {
    return 0;
  }

  const coverage = matchedTokens.length / queryTokens.length;
  if (coverage < 0.5) {
    return 0;
  }

  return (
    coverage * 100 +
    (searchableText.includes(normalizedQuery) ? 50 : 0) +
    (name.includes(normalizedQuery) ? 120 : 0) +
    (queryTokens.some((token) => code === token) ? 40 : 0) +
    (queryTokens.some((token) => brand === token) ? 30 : 0) +
    (nameMatchedTokens.length / queryTokens.length) * 100
  );
}

function tokenMatchesText(token: string, text: string): boolean {
  if (text.includes(token)) return true;
  const singular =
    token.length > 4 && token.endsWith('es')
      ? token.slice(0, -2)
      : token.length > 3 && token.endsWith('s')
        ? token.slice(0, -1)
        : token;
  return singular !== token && text.includes(singular);
}
