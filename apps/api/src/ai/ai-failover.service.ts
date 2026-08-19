import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GEMINI_PROVIDER, OPENAI_PROVIDER } from './domain/ai-provider';
import type {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from './domain/ai-provider';

@Injectable()
export class AiFailoverService {
  private readonly logger = new Logger(AiFailoverService.name);

  constructor(
    @Inject(GEMINI_PROVIDER) private readonly primary: AiProvider,
    @Inject(OPENAI_PROVIDER) private readonly fallback: AiProvider,
  ) {}

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    try {
      return await this.primary.generate(request);
    } catch (primaryError) {
      this.logger.warn(
        'Primary AI provider failed; invoking fallback provider',
      );

      try {
        return await this.fallback.generate(request);
      } catch (fallbackError) {
        throw new ServiceUnavailableException(
          'All configured AI providers are unavailable',
          { cause: { primaryError, fallbackError } },
        );
      }
    }
  }
}
