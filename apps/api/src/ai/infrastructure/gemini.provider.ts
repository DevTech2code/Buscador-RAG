import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from '../domain/ai-provider';
import { postJson, requireText } from './ai-http';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMilliseconds: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY', '');
    this.model = config.get<string>('GEMINI_MODEL', 'gemini-3.1-flash-lite');
    this.timeoutMilliseconds = config.get<number>('AI_TIMEOUT_MS', 30000);
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    const payload = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
        contents: request.messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxOutputTokens ?? 800,
          responseMimeType: request.responseMimeType ?? 'text/plain',
        },
      },
      this.timeoutMilliseconds,
    )) as GeminiResponse;

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');

    return {
      text: requireText(text, 'Gemini'),
      provider: this.name,
      model: this.model,
    };
  }
}
