import { Injectable, Logger } from '@nestjs/common';
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
export class ErpCatalogService {
  private static readonly CACHE_KEY = 'erp:catalog:products:v1';
  private static readonly REFRESH_LOCK_KEY = 'erp:catalog:products:refresh:v1';

  private readonly logger = new Logger(ErpCatalogService.name);
  private readonly productsUrl: string;
  private readonly cacheTtlSeconds: number;
  private readonly localCacheTtlMilliseconds: number;

  private localCatalog: ErpCatalogEnvelope | null = null;
  private localCatalogExpiresAt = 0;
  private refreshPromise: Promise<ErpCatalogEnvelope> | null = null;

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
  }

  async search(query: string, limit: number): Promise<ProductSearchResponse> {
    const catalog = await this.getCatalog();
    const normalizedQuery = normalizeSearchText(query);
    const matches: ErpProduct[] = [];

    for (const product of catalog.products) {
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

      if (searchableText.includes(normalizedQuery)) {
        matches.push(product);
      }
      if (matches.length >= limit) {
        break;
      }
    }

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

  private async getCatalog(): Promise<ErpCatalogEnvelope> {
    if (this.localCatalog && Date.now() < this.localCatalogExpiresAt) {
      return this.localCatalog;
    }

    const sharedCatalog = await this.redisService.getJson<ErpCatalogEnvelope>(
      ErpCatalogService.CACHE_KEY,
    );
    if (isCatalogEnvelope(sharedCatalog)) {
      this.setLocalCatalog(sharedCatalog);
      return sharedCatalog;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshCatalog().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
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
        this.cacheTtlSeconds,
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
