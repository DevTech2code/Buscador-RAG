import { Module } from '@nestjs/common';
import { AiFailoverService } from './ai-failover.service';
import { GEMINI_PROVIDER, OPENAI_PROVIDER } from './domain/ai-provider';
import { GeminiProvider } from './infrastructure/gemini.provider';
import { OpenAiProvider } from './infrastructure/openai.provider';

@Module({
  providers: [
    AiFailoverService,
    { provide: GEMINI_PROVIDER, useClass: GeminiProvider },
    { provide: OPENAI_PROVIDER, useClass: OpenAiProvider },
  ],
  exports: [AiFailoverService],
})
export class AiModule {}
