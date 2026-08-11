# Buscador RAG

Asistente virtual inteligente de ventas e-commerce para consultar fichas
técnicas, validar inventario en tiempo real y recomendar alternativas permitidas
por el catálogo activo del ERP.

## Requisitos

- Node.js 24.19.0
- pnpm 11.21.0
- Docker Desktop con contenedores Linux
- Docker Compose

## Estructura inicial

```text
apps/
  api/       API NestJS
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

La API queda disponible en `http://localhost:3000` y su health check en
`http://localhost:3000/health`. Redis y Qdrant solo son accesibles desde la red
interna de Docker.

Ejecuta las verificaciones del workspace:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

El proyecto utiliza exclusivamente `pnpm`. No deben generarse archivos
`package-lock.json` ni `yarn.lock`.
