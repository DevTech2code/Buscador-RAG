import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ChatSession } from './domain/chat-session';
import { ChatSessionService } from './chat-session.service';

describe('ChatSessionService', () => {
  const storage = new Map<string, ChatSession>();
  const redis = {
    setJsonOrThrow: jest.fn((key: string, value: ChatSession) => {
      storage.set(key, structuredClone(value));
      return Promise.resolve();
    }),
    getJsonOrThrow: jest.fn((key: string) =>
      Promise.resolve(structuredClone(storage.get(key) ?? null)),
    ),
    acquireLock: jest.fn(() => Promise.resolve('lock-token')),
    releaseLock: jest.fn(() => Promise.resolve()),
  };
  const config = {
    getOrThrow: jest.fn(() => 14400),
  };
  let service: ChatSessionService;

  beforeEach(() => {
    storage.clear();
    jest.clearAllMocks();
    service = new ChatSessionService(
      config as unknown as ConfigService,
      redis as unknown as RedisService,
    );
  });

  it('creates and retrieves a session', async () => {
    const created = await service.create();
    const restored = await service.findById(created.id);

    expect(restored).toEqual(created);
    expect(restored.messages).toEqual([]);
  });

  it('appends a normalized user message', async () => {
    const session = await service.create();
    const updated = await service.appendUserMessage(
      session.id,
      '  Necesito un monitor de 27 pulgadas  ',
    );

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toMatchObject({
      role: 'user',
      content: 'Necesito un monitor de 27 pulgadas',
    });
  });
});
