# Guardrails del asistente de ventas

Estas políticas se aplican en NestJS antes de permitir que un proveedor LLM
redacte una respuesta. El modelo no decide qué productos están autorizados.

### Alcance informativo

- El sistema solo informa catálogo, especificaciones, datasheets y disponibilidad.
- No vende, reserva, cotiza, factura ni procesa pedidos.
- Una verificación en vivo solo actualiza información; no compromete inventario.

## Reglas reforzadas por backend

### Catálogo

- Todo producto solicitado o alternativo debe pertenecer al catálogo del ERP.
- Un SKU externo se descarta aunque haya sido propuesto por un modelo.
- Productos marcados como bloqueados no pueden ser alternativas.
- Los candidatos duplicados se eliminan.

### Inventario

- Las consultas informativas usan el snapshot compartido más reciente.
- El SKU de la respuesta de stock debe coincidir con el producto evaluado.
- El snapshot se sincroniza continuamente desde Insoft y registra su antigüedad.
- Un snapshot vencido no se presenta como disponibilidad actual confirmada.
- El asesor puede solicitar una verificación informativa directa en Insoft.
- Una alternativa requiere `totalQuantity > 0`.
- Si no existe respuesta de stock, la política falla de forma cerrada.

### Disponibilidad y alternativas

- Producto disponible: no se muestran alternativas, salvo petición explícita.
- Producto agotado: se aprueban como máximo tres alternativas.
- Producto inexistente: se aprueba únicamente la alternativa más cercana.
- Búsqueda abierta: se aprueban entre tres y cinco resultados como máximo.
- Las alternativas se ordenan por equivalencia técnica descendente.

### Evidencia y salida

- Una especificación necesita una referencia del ERP o de un datasheet.
- La respuesta para el asesor no puede contener bloques de código ni JSON crudo.
- Las consultas fuera del dominio reciben un mensaje fijo de reorientación.

## Integración pendiente

El orquestador conversacional deberá ejecutar estas políticas en este orden:

1. Clasificar el alcance de la consulta.
2. Resolver requisitos y productos mencionados.
3. Recuperar catálogo y evidencia documental.
4. Consultar el snapshot vigente o realizar una verificación informativa en vivo.
5. Generar candidatos técnicos.
6. Solicitar aprobación al `GuardrailsModule`.
7. Entregar al LLM únicamente productos y evidencia aprobados.
8. Validar el formato final antes de responder al asesor.

Ninguna respuesta generada por un LLM podrá saltarse este flujo.
