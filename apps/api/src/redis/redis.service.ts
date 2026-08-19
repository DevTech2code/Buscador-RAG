import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: ReturnType<typeof createClient>;
  private connectionPromise: Promise<void> | null = null;

  constructor(configService: ConfigService) {
    const url = configService.getOrThrow<string>('REDIS_URL');

    this.client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries >= 10) {
            return new Error('Redis reconnect limit reached');
          }

          return Math.min(100 * 2 ** retries, 3000);
        },
      },
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      await this.ensureConnected();
      const value = await this.client.get(key);

      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logOperationFailure('read', error);
      return null;
    }
  }

  async getJsonOrThrow<T>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const value = await this.client.get(key);

    return value === null ? null : (JSON.parse(value) as T);
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.ensureConnected();
      await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (error) {
      this.logOperationFailure('write', error);
    }
  }

  async setJsonOrThrow(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.ensureConnected();
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }

  async acquireLock(
    key: string,
    ttlMilliseconds: number,
  ): Promise<string | null> {
    try {
      await this.ensureConnected();
      const token = randomUUID();
      const result = await this.client.set(key, token, {
        NX: true,
        PX: ttlMilliseconds,
      });

      return result === 'OK' ? token : null;
    } catch (error) {
      this.logOperationFailure('lock', error);
      return null;
    }
  }

  async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        { keys: [key], arguments: [token] },
      );
    } catch (error) {
      this.logOperationFailure('unlock', error);
    }
  }

  async waitForJson<T>(
    key: string,
    timeoutMilliseconds: number,
    pollMilliseconds = 250,
  ): Promise<T | null> {
    const deadline = Date.now() + timeoutMilliseconds;

    while (Date.now() < deadline) {
      const value = await this.getJson<T>(key);
      if (value !== null) {
        return value;
      }

      await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
    }

    return null;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isReady) {
      return;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect().then(() => undefined);
    }

    try {
      await this.connectionPromise;
    } catch (error) {
      this.connectionPromise = null;
      throw new ServiceUnavailableException('Redis is unavailable', {
        cause: error,
      });
    }
  }

  private logOperationFailure(operation: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Redis ${operation} failed: ${message}`);
  }
}
