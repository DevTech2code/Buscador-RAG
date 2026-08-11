import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ErpConcurrencyLimiter {
  private readonly maximumConcurrent: number;
  private readonly maximumQueueSize: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(configService: ConfigService) {
    this.maximumConcurrent = configService.getOrThrow<number>(
      'ERP_MAX_CONCURRENCY',
    );
    this.maximumQueueSize =
      configService.getOrThrow<number>('ERP_MAX_QUEUE_SIZE');
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maximumConcurrent) {
      this.active += 1;
      return;
    }

    if (this.queue.length >= this.maximumQueueSize) {
      throw new ServiceUnavailableException('ERP request queue is full');
    }

    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.queue.shift()?.();
  }
}
