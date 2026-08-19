# syntax=docker/dockerfile:1.7

FROM node:24.19.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,id=pnpm-web-store,target=/pnpm/store \
    pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 10000 \
    && pnpm config set fetch-retry-maxtimeout 120000 \
    && pnpm install --frozen-lockfile --filter @buscador-rag/web... \
      --network-concurrency=8

FROM dependencies AS build

COPY . .

RUN pnpm --filter @buscador-rag/web build

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

USER node

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
