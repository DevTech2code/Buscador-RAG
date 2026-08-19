# syntax=docker/dockerfile:1.7

FROM node:24.19.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json

RUN --mount=type=cache,id=pnpm-api-store,target=/pnpm/store \
    pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 10000 \
    && pnpm config set fetch-retry-maxtimeout 120000 \
    && pnpm install --frozen-lockfile --filter @buscador-rag/api... \
      --network-concurrency=8

FROM dependencies AS build

COPY . .

WORKDIR /workspace/apps/api

RUN ./node_modules/.bin/nest build

FROM dependencies AS production-dependencies

RUN --mount=type=cache,id=pnpm-api-store,target=/pnpm/store \
    pnpm install --prod --offline --frozen-lockfile \
      --filter @buscador-rag/api...

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/apps/api

COPY --from=production-dependencies --chown=node:node /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
