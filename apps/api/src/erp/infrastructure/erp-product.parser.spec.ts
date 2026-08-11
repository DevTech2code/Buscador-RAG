import { parseErpProducts } from './erp-product.parser';

describe('parseErpProducts', () => {
  it('normalizes a valid ERP product', () => {
    const [product] = parseErpProducts([createRawProduct()]);

    expect(product).toMatchObject({
      code: 'TEC-EC1000-PLUS-W',
      brandName: 'TECLAM',
      blocked: null,
    });
  });

  it('rejects a product without a code', () => {
    expect(() =>
      parseErpProducts([{ ...createRawProduct(), codigoProducto: null }]),
    ).toThrow('codigoProducto');
  });
});

function createRawProduct(): Record<string, unknown> {
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
  };
}
