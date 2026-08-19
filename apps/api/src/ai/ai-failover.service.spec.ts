import { AiFailoverService } from './ai-failover.service';
import {
  AiGenerationRequest,
  AiGenerationResult,
  AiProvider,
} from './domain/ai-provider';

describe('AiFailoverService', () => {
  const request: AiGenerationRequest = {
    systemInstruction: 'Stay within the catalog.',
    messages: [{ role: 'user', content: 'Necesito un monitor' }],
  };

  it('uses Gemini when the primary provider succeeds', async () => {
    const { provider: primary } = createProvider(
      'gemini',
      'Respuesta principal',
    );
    const { provider: fallback, generate: fallbackGenerate } = createProvider(
      'openai',
      'Respuesta secundaria',
    );
    const service = new AiFailoverService(primary, fallback);

    await expect(service.generate(request)).resolves.toMatchObject({
      provider: 'gemini',
      text: 'Respuesta principal',
    });
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('uses OpenAI when Gemini fails', async () => {
    const { provider: primary, generate: primaryGenerate } = createProvider(
      'gemini',
      'unused',
    );
    primaryGenerate.mockRejectedValue(new Error('timeout'));
    const { provider: fallback } = createProvider(
      'openai',
      'Respuesta de respaldo',
    );
    const service = new AiFailoverService(primary, fallback);

    await expect(service.generate(request)).resolves.toMatchObject({
      provider: 'openai',
      text: 'Respuesta de respaldo',
    });
  });
});

function createProvider(
  name: 'gemini' | 'openai',
  text: string,
): {
  provider: AiProvider;
  generate: jest.MockedFunction<AiProvider['generate']>;
} {
  const generate = jest.fn<Promise<AiGenerationResult>, [AiGenerationRequest]>(
    (request) => {
      void request;
      return Promise.resolve({ text, provider: name, model: 'test' });
    },
  );

  return {
    provider: { name, generate },
    generate,
  };
}
