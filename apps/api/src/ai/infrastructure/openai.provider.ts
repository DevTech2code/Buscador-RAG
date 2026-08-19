import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from '../domain/ai-provider';
import { postJson, requireText } from './ai-http';

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMilliseconds: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY', '');
    this.model = config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    this.timeoutMilliseconds = config.get<number>('AI_TIMEOUT_MS', 30000);
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('OpenAI API key is not configured');
    }

    const payload = (await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          ...request.messages,
        ],
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxOutputTokens ?? 800,
        ...(request.responseMimeType === 'application/json'
          ? { response_format: { type: 'json_object' } }
          : {}),
      },
      this.timeoutMilliseconds,
    )) as OpenAiResponse;

    return {
      text: requireText(payload.choices?.[0]?.message?.content, 'OpenAI'),
      provider: this.name,
      model: this.model,
    };
  }
}
