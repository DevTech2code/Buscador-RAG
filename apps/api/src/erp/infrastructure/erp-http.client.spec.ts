import { ConfigService } from '@nestjs/config';
import { ErpCircuitBreaker } from './erp-circuit-breaker';
import { ErpConcurrencyLimiter } from './erp-concurrency-limiter';
import { ErpHttpClient } from './erp-http.client';

describe('ErpHttpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('counts all retry attempts as one circuit-breaker failure', async () => {
    const config = new ConfigService({
      ERP_AUTHORIZATION: 'authorization',
      ERP_COMPANY_CODE: '102',
      ERP_TIMEOUT_MS: 1000,
      ERP_MAX_RETRIES: 1,
      ERP_MAX_CONCURRENCY: 1,
      ERP_MAX_QUEUE_SIZE: 10,
      ERP_CIRCUIT_FAILURE_THRESHOLD: 2,
      ERP_CIRCUIT_RESET_MS: 30_000,
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response('unavailable', {
        status: 503,
      }),
    );
    const client = new ErpHttpClient(
      config,
      new ErpCircuitBreaker(config),
      new ErpConcurrencyLimiter(config),
    );

    await expect(
      client.getJson('http://erp.example/inventory'),
    ).rejects.toThrow('ERP responded with HTTP 503');
    await expect(
      client.getJson('http://erp.example/inventory'),
    ).rejects.toThrow('ERP responded with HTTP 503');

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});
