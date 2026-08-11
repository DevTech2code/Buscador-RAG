import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpCircuitBreaker } from './erp-circuit-breaker';

describe('ErpCircuitBreaker', () => {
  it('opens after the configured number of failures', async () => {
    const breaker = new ErpCircuitBreaker(
      new ConfigService({
        ERP_CIRCUIT_FAILURE_THRESHOLD: 2,
        ERP_CIRCUIT_RESET_MS: 30_000,
      }),
    );
    const failure = () => Promise.reject(new Error('ERP unavailable'));

    await expect(breaker.execute(failure)).rejects.toThrow('ERP unavailable');
    await expect(breaker.execute(failure)).rejects.toThrow('ERP unavailable');
    await expect(
      breaker.execute(() => Promise.resolve('ok')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('stays closed after a successful request', async () => {
    const breaker = new ErpCircuitBreaker(
      new ConfigService({
        ERP_CIRCUIT_FAILURE_THRESHOLD: 2,
        ERP_CIRCUIT_RESET_MS: 30_000,
      }),
    );

    await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe(
      'ok',
    );
    await expect(breaker.execute(() => Promise.resolve('again'))).resolves.toBe(
      'again',
    );
  });
});
