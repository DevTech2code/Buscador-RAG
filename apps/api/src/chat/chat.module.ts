import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { ErpModule } from '../erp/erp.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { ChatSessionService } from './chat-session.service';
import { ChatController } from './chat.controller';
import { ChatIntentService } from './chat-intent.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';

@Module({
  imports: [RedisModule, AiModule, ErpModule, GuardrailsModule],
  controllers: [ChatController],
  providers: [ChatSessionService, ChatIntentService, ChatOrchestratorService],
  exports: [ChatSessionService],
})
export class ChatModule {}
