import { ServiceUnavailableException } from '@nestjs/common';
import { AiFailoverService } from '../ai/ai-failover.service';
import { ChatIntentService } from './chat-intent.service';

describe('ChatIntentService', () => {
  it('accepts null search terms for greetings', async () => {
    const ai = {
      generate: jest.fn(() =>
        Promise.resolve({
          text: JSON.stringify({
            intent: 'greeting',
            searchTerm: null,
            productCode: null,
          }),
          provider: 'gemini' as const,
          model: 'test-model',
        }),
      ),
    };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    await expect(
      service.classify(
        [
          {
            id: 'message-id',
            role: 'user',
            content: 'Hola',
            createdAt: new Date().toISOString(),
          },
        ],
        emptyContext(),
      ),
    ).resolves.toMatchObject({ intent: 'greeting', searchTerm: '' });
  });

  it('rejects intents outside the allowed contract', async () => {
    const ai = {
      generate: jest.fn(() =>
        Promise.resolve({
          text: JSON.stringify({
            intent: 'check_stock',
            searchTerm: null,
            productCode: null,
          }),
          provider: 'gemini' as const,
          model: 'test-model',
        }),
      ),
    };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    await expect(
      service.classify(
        [
          {
            id: 'message-id',
            role: 'user',
            content: 'Consulta stock',
            createdAt: new Date().toISOString(),
          },
        ],
        emptyContext(),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('classifies explicit brand searches without calling an AI provider', async () => {
    const ai = { generate: jest.fn() };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    await expect(
      service.classify(
        [
          {
            id: 'message-id',
            role: 'user',
            content: 'Muéstrame productos de la marca [TECLAM]',
            createdAt: new Date().toISOString(),
          },
        ],
        emptyContext(),
      ),
    ).resolves.toMatchObject({
      intent: 'product_search',
      searchTerm: 'TECLAM',
      provider: 'deterministic',
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('resolves ordinal references from the structured conversation context', async () => {
    const ai = { generate: jest.fn() };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    const result = await service.classify(
      [
        {
          id: 'message-id',
          role: 'user',
          content: '¿Y el segundo?',
          createdAt: new Date().toISOString(),
        },
      ],
      {
        lastSearchTerm: 'TECLAM',
        selectedProductCode: 'SKU-1',
        lastShownProducts: [
          {
            code: 'SKU-1',
            name: 'Primero',
            stockQuantity: 20,
            brandName: 'MARCA',
          },
          {
            code: 'SKU-2',
            name: 'Segundo',
            stockQuantity: 10,
            brandName: 'MARCA',
          },
        ],
      },
    );

    expect(result).toMatchObject({
      intent: 'stock_check',
      productCode: 'SKU-2',
      provider: 'deterministic',
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('resolves comparison actions without calling AI', async () => {
    const ai = { generate: jest.fn() };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);
    const context = {
      lastSearchTerm: 'TECLAM',
      selectedProductCode: 'SKU-1',
      lastShownProducts: [
        {
          code: 'SKU-1',
          name: 'Primero',
          stockQuantity: 20,
          brandName: 'TECLAM',
        },
        {
          code: 'SKU-2',
          name: 'Segundo',
          stockQuantity: 10,
          brandName: 'TECLAM',
        },
        {
          code: 'SKU-3',
          name: 'Tercero',
          stockQuantity: 30,
          brandName: 'TECLAM',
        },
      ],
    };

    const result = await service.classify(
      [
        {
          id: 'id',
          role: 'user',
          content: 'Compara el segundo con el tercero',
          createdAt: new Date().toISOString(),
        },
      ],
      context,
    );

    expect(result.conversationAction).toEqual({
      type: 'compare',
      productCodes: ['SKU-2', 'SKU-3'],
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('classifies ordinary product searches without calling AI', async () => {
    const ai = { generate: jest.fn() };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    const result = await service.classify(
      [
        {
          id: 'id',
          role: 'user',
          content: 'Muéstrame productos con cable UTP categoría 6',
          createdAt: new Date().toISOString(),
        },
      ],
      emptyContext(),
    );

    expect(result).toMatchObject({
      intent: 'product_search',
      searchTerm: 'cable UTP categoría 6',
      provider: 'deterministic',
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('classifies explicit SKU stock checks without calling AI', async () => {
    const ai = { generate: jest.fn() };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    const result = await service.classify(
      [
        {
          id: 'id',
          role: 'user',
          content: '¿Cuánto stock tiene el SKU TEC-EC1000-PLUS-W?',
          createdAt: new Date().toISOString(),
        },
      ],
      emptyContext(),
    );

    expect(result).toMatchObject({
      intent: 'stock_check',
      searchTerm: 'TEC-EC1000-PLUS-W',
      productCode: 'TEC-EC1000-PLUS-W',
      provider: 'deterministic',
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it('delegates natural related-product language to AI interpretation', async () => {
    const ai = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          intent: 'product_search',
          searchTerm: 'fuente de poder',
          productCode: null,
        }),
        provider: 'gemini' as const,
        model: 'test-model',
      }),
    };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    const result = await service.classify(
      [
        {
          id: 'id',
          role: 'user',
          content: 'Dame una fuente de poder para esa cámara bala',
          createdAt: new Date().toISOString(),
        },
      ],
      cameraContext(),
    );

    expect(result).toMatchObject({
      intent: 'product_search',
      searchTerm: 'fuente de poder',
      productCode: null,
      provider: 'gemini',
    });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it('delegates natural alternative requests to AI interpretation', async () => {
    const ai = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          intent: 'replacement',
          searchTerm: 'camara bala',
          productCode: null,
        }),
        provider: 'gemini' as const,
        model: 'test-model',
      }),
    };
    const service = new ChatIntentService(ai as unknown as AiFailoverService);

    const result = await service.classify(
      [
        {
          id: 'id',
          role: 'user',
          content: 'Dame alternativas de cámara bala',
          createdAt: new Date().toISOString(),
        },
      ],
      cameraContext(),
    );

    expect(result).toMatchObject({
      intent: 'replacement',
      searchTerm: 'camara bala',
      productCode: null,
      provider: 'gemini',
    });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });
});

function cameraContext() {
  return {
    lastSearchTerm: 'camara bala',
    selectedProductCode: 'THC-B227-LTS',
    lastShownProducts: [
      {
        code: 'THC-B227-LTS',
        name: 'CÁMARA BALA FIJA CON AUDIO BIDIRECCIONAL',
        stockQuantity: 261,
        brandName: 'HIKVISION',
      },
    ],
  };
}

function emptyContext() {
  return {
    lastSearchTerm: null,
    selectedProductCode: null,
    lastShownProducts: [],
  };
}
