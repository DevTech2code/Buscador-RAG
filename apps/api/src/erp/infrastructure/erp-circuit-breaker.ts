import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CircuitState = 'closed' | 'open' | 'half-open';

@Injectable()
export class ErpCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetMilliseconds: number;
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private halfOpenRequestInProgress = false;

  constructor(configService: ConfigService) {
    this.failureThreshold = configService.getOrThrow<number>(
      'ERP_CIRCUIT_FAILURE_THRESHOLD',
    );
    this.resetMilliseconds = configService.getOrThrow<number>(
      'ERP_CIRCUIT_RESET_MS',
    );
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.assertRequestAllowed();

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private assertRequestAllowed(): void {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.resetMilliseconds) {
        throw new ServiceUnavailableException(
          'ERP circuit is open; request rejected',
        );
      }

      this.state = 'half-open';
    }

    if (this.state === 'half-open') {
      if (this.halfOpenRequestInProgress) {
        throw new ServiceUnavailableException(
          'ERP circuit is testing recovery; request rejected',
        );
      }

      this.halfOpenRequestInProgress = true;
    }
  }

  private recordSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenRequestInProgress = false;
  }

  private recordFailure(): void {
    this.halfOpenRequestInProgress = false;
    this.failures += 1;

    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}
