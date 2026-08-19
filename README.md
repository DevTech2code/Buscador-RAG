# Buscador RAG

Asistente virtual informativo para asesores comerciales que permite consultar fichas
técnicas, validar inventario en tiempo real y recomendar alternativas permitidas
por el catálogo activo del ERP.

El sistema no vende, reserva, cotiza, factura ni procesa pedidos.

## Requisitos

- Node.js 24.19.0
- pnpm 11.21.0
- Docker Desktop con contenedores Linux
- Docker Compose

## Estructura inicial

```text
apps/
  api/       API NestJS
  web/       Interfaz Next.js para el asesor
packages/    Librerías compartidas futuras
```

## Desarrollo

Instala las dependencias desde la raíz:

```bash
pnpm install --frozen-lockfile
```

Inicia la API en modo desarrollo:

```bash
pnpm --filter @buscador-rag/api dev
```

Levanta el entorno contenerizado:

```bash
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

La interfaz del asesor queda disponible en `http://localhost:3001`. La API queda disponible en `http://localhost:3000` y su health check en
`http://localhost:3000/health`. Redis y Qdrant solo son accesibles desde la red
interna de Docker.

Consulta productos del catálogo ERP mediante NestJS:

```text
GET /erp/products/search?query=electrificador&limit=20
GET /erp/products/TEC-EC1000-PLUS-W
GET /erp/inventory/TEC-EC1000-PLUS-W
```

La memoria multi-turno se administra mediante sesiones temporales en Redis:

```text
POST /chat/sessions
GET  /chat/sessions/:sessionId
POST /chat/sessions/:sessionId/messages
POST /chat/sessions/:sessionId/messages/stream
```

El cuerpo para agregar un mensaje es `{ "content": "texto del asesor" }`. La
sesión conserva como máximo 40 mensajes y expira después del tiempo definido en
`CHAT_SESSION_TTL_SECONDS` (cuatro horas por defecto). El historial no almacena
snapshots de inventario dentro de la sesión. El stock compartido se sincroniza
independientemente desde Insoft.

El endpoint `/messages/stream` recibe el mismo cuerpo y responde como
`text/event-stream`. Emite eventos `progress`, `completed` y `error`; está
diseñado para consumirse mediante `fetch` streaming desde Next.js sin incluir
el mensaje del asesor en la URL.

La autorización del ERP se carga exclusivamente desde `.env`. El catálogo se
mantiene en caché compartida en Redis para evitar descargarlo en cada búsqueda.
El inventario se sincroniza en un snapshot compartido en Redis para evitar que
cada asesor descargue el inventario completo. Cada respuesta informa la fuente,
antigüedad y frescura del dato.

Las reglas obligatorias de catálogo, stock, alternativas, evidencia y formato
están documentadas en [`docs/guardrails.md`](docs/guardrails.md).

Ejecuta las verificaciones del workspace:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

El proyecto utiliza exclusivamente `pnpm`. No deben generarse archivos
`package-lock.json` ni `yarn.lock`.
