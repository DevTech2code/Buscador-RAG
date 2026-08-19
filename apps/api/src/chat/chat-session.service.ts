import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import {
  ChatConversationContext,
  ChatMessage,
  ChatSession,
} from './domain/chat-session';

@Injectable()
export class ChatSessionService {
  private static readonly KEY_PREFIX = 'chat:session:v1:';
  private static readonly MAX_HISTORY_MESSAGES = 40;
  private static readonly WRITE_LOCK_TTL_MILLISECONDS = 5000;
  private readonly ttlSeconds: number;

  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.ttlSeconds = configService.getOrThrow<number>(
      'CHAT_SESSION_TTL_SECONDS',
    );
  }

  async create(): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      context: emptyContext(),
    };

    await this.save(session);
    return { ...session, context: session.context ?? emptyContext() };
  }

  async findById(sessionId: string): Promise<ChatSession> {
    const session = await this.redisService.getJsonOrThrow<ChatSession>(
      this.key(sessionId),
    );

    if (!session) {
      throw new NotFoundException('Chat session was not found or has expired');
    }

    return session;
  }

  async appendUserMessage(
    sessionId: string,
    content: string,
  ): Promise<ChatSession> {
    return this.appendMessage(sessionId, 'user', content);
  }

  async appendAssistantMessage(
    sessionId: string,
    content: string,
    contextPatch?: Partial<ChatConversationContext>,
  ): Promise<ChatSession> {
    return this.appendMessage(sessionId, 'assistant', content, contextPatch);
  }

  private async appendMessage(
    sessionId: string,
    role: ChatMessage['role'],
    content: string,
    contextPatch?: Partial<ChatConversationContext>,
  ): Promise<ChatSession> {
    const lockKey = `${this.key(sessionId)}:write-lock`;
    const lockToken = await this.redisService.acquireLock(
      lockKey,
      ChatSessionService.WRITE_LOCK_TTL_MILLISECONDS,
    );

    if (!lockToken) {
      throw new ConflictException(
        'Another message is being processed for this chat session',
      );
    }

    try {
      const session = await this.findById(sessionId);
      const message: ChatMessage = {
        id: randomUUID(),
        role,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };

      session.messages = [...session.messages, message].slice(
        -ChatSessionService.MAX_HISTORY_MESSAGES,
      );
      session.updatedAt = message.createdAt;
      if (contextPatch) {
        session.context = { ...session.context, ...contextPatch };
      }
      await this.save(session);

      return session;
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  private save(session: ChatSession): Promise<void> {
    return this.redisService.setJsonOrThrow(
      this.key(session.id),
      session,
      this.ttlSeconds,
    );
  }

  private key(sessionId: string): string {
    return `${ChatSessionService.KEY_PREFIX}${sessionId}`;
  }
}

function emptyContext(): ChatConversationContext {
  return {
    lastSearchTerm: null,
    selectedProductCode: null,
    lastShownProducts: [],
  };
}
