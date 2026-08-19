import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpCircuitBreaker } from './erp-circuit-breaker';
import { ErpConcurrencyLimiter } from './erp-concurrency-limiter';

class ErpRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class ErpHttpClient {
  private readonly authorization: string;
  private readonly companyCode: string;
  private readonly timeoutMilliseconds: number;
  private readonly maximumRetries: number;

  constructor(
    configService: ConfigService,
    private readonly circuitBreaker: ErpCircuitBreaker,
    private readonly concurrencyLimiter: ErpConcurrencyLimiter,
  ) {
    this.authorization = configService.getOrThrow<string>('ERP_AUTHORIZATION');
    this.companyCode = configService.getOrThrow<string>('ERP_COMPANY_CODE');
    this.timeoutMilliseconds =
      configService.getOrThrow<number>('ERP_TIMEOUT_MS');
    this.maximumRetries = configService.getOrThrow<number>('ERP_MAX_RETRIES');
  }

  get maximumRequestDurationMilliseconds(): number {
    return this.timeoutMilliseconds * (this.maximumRetries + 1) + 10_000;
  }

  async getJson(endpoint: string): Promise<unknown> {
    return this.circuitBreaker.execute(() => this.getJsonWithRetries(endpoint));
  }

  private async getJsonWithRetries(endpoint: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maximumRetries; attempt += 1) {
      try {
        return await this.concurrencyLimiter.run(() =>
          this.requestJson(endpoint),
        );
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.maximumRetries) {
          throw error;
        }

        const delayMilliseconds =
          250 * 2 ** attempt + Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
      }
    }

    throw lastError;
  }

  private async requestJson(endpoint: string): Promise<unknown> {
    const url = new URL(endpoint);
    url.searchParams.set('pautorizacion', this.authorization);
    url.searchParams.set('pcod_empresa', this.companyCode);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMilliseconds),
      });
    } catch (error) {
      throw new ErpRequestError(
        `ERP network request failed: ${safeErrorMessage(error)}`,
        true,
      );
    }

    if (!response.ok) {
      throw new ErpRequestError(
        `ERP responded with HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new ErpRequestError(
        `ERP returned invalid JSON: ${safeErrorMessage(error)}`,
        false,
      );
    }
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof ErpRequestError && error.retryable;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
