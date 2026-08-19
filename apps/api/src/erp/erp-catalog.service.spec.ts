import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ErpCatalogService } from './erp-catalog.service';
import { ErpCircuitBreaker } from './infrastructure/erp-circuit-breaker';
import { ErpConcurrencyLimiter } from './infrastructure/erp-concurrency-limiter';
import { ErpHttpClient } from './infrastructure/erp-http.client';

describe('ErpCatalogService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deduplicates concurrent catalog refreshes', async () => {
    const config = createConfigService();
    const redis = {
      getJson: jest.fn().mockResolvedValue(null),
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      waitForJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify([createRawProduct()]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new ErpCatalogService(
      config,
      redis as unknown as RedisService,
      new ErpHttpClient(
        config,
        new ErpCircuitBreaker(config),
        new ErpConcurrencyLimiter(config),
      ),
    );

    const [first, second] = await Promise.all([
      service.search('electrificador', 20),
      service.search('teclam', 20),
    ]);

    expect(first.matches).toHaveLength(1);
    expect(second.matches).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledTimes(1);
  });

  it('ignores generic sales words and matches relevant catalog terms', async () => {
    const config = createConfigService();
    const redis = {
      getJson: jest.fn().mockResolvedValue(null),
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      waitForJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify([createRawProduct()]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const service = new ErpCatalogService(
      config,
      redis as unknown as RedisService,
      new ErpHttpClient(
        config,
        new ErpCircuitBreaker(config),
        new ErpConcurrencyLimiter(config),
      ),
    );

    const result = await service.search('productos marca TECLAM', 5);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.brandName).toBe('TECLAM');
  });

  it('prioritizes a camera whose name matches over ancillary equipment', async () => {
    const config = createConfigService();
    const redis = {
      getJson: jest.fn().mockResolvedValue(null),
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      waitForJson: jest.fn(),
      setJson: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          createRawProduct({
            codigoProducto: 'DVR-1',
            nombreProducto: 'DVR 8 CANALES COMPATIBLE CON CAMARAS',
            nombreLineaProducto: 'EQUIPOS PARA EXTERIORES',
          }),
          createRawProduct({
            codigoProducto: 'CAM-1',
            nombreProducto: 'CAMARA PARA EXTERIORES',
            nombreLineaProducto: 'CAMARAS',
          }),
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const service = new ErpCatalogService(
      config,
      redis as unknown as RedisService,
      new ErpHttpClient(
        config,
        new ErpCircuitBreaker(config),
        new ErpConcurrencyLimiter(config),
      ),
    );

    const result = await service.search('camaras para exteriores', 5);

    expect(result.matches[0]?.code).toBe('CAM-1');
  });
});

function createConfigService(): ConfigService {
  return new ConfigService({
    ERP_PRODUCTS_URL: 'http://erp.example/api/productos',
    ERP_INVENTORY_URL: 'http://erp.example/api/inventario',
    ERP_AUTHORIZATION: 'secret-value',
    ERP_COMPANY_CODE: '102',
    ERP_TIMEOUT_MS: 5000,
    ERP_MAX_RETRIES: 0,
    ERP_MAX_CONCURRENCY: 1,
    ERP_MAX_QUEUE_SIZE: 10,
    ERP_CACHE_TTL_SECONDS: 300,
    ERP_CATALOG_WARM_INTERVAL_SECONDS: 240,
    ERP_LOCAL_CACHE_TTL_SECONDS: 30,
    ERP_CIRCUIT_FAILURE_THRESHOLD: 3,
    ERP_CIRCUIT_RESET_MS: 30_000,
  });
}

function createRawProduct(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    nroRegistro: 1,
    codigoProducto: 'TEC-EC1000-PLUS-W',
    codigoEmpresa: '102',
    nombreProducto: 'ELECTRIFICADOR DE CERCA',
    codigoBarrasProducto: null,
    pesoProducto: null,
    codigoClasificacionProducto: '67',
    nombreClasificacionProducto: 'ELECTRIFICADOR',
    codigoDepartamentoProducto: '35',
    nombreDepartamentoProducto: 'TECLAM',
    codigoLineaProducto: '55',
    nombreLineaProducto: 'ACCESORIOS DE CERCA ELECTRICA',
    codigoMarcaProducto: '35',
    nombreMarcaProducto: 'TECLAM',
    codigoMedidaProducto: 'UNI',
    nombreMedidaProducto: 'UNIDAD',
    codigoTipoProducto: '0',
    tipoProducto: 'PRODUCTO',
    origenProducto: 'BRASIL',
    indBloqueadoProducto: null,
    ultimaFechacosto: '2025-07-28',
    ...overrides,
  };
}
