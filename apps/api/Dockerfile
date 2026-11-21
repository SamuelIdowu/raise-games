# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/api/Dockerfile -t raise/api .
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/schemas/package.json ./packages/schemas/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/game-configs/package.json ./packages/game-configs/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=@raise/api...

FROM base AS runner
ENV NODE_ENV=production
# Not root (audit B5). The API writes nothing to disk, so root-owned files are fine to read.
COPY --from=build /app ./
USER node
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# instrument.js starts OpenTelemetry only when OTEL_EXPORTER_OTLP_ENDPOINT is set (F15.4).
# Migrations are a separate release step: node dist/db/migrate.js (audit B6).
CMD ["node", "--require", "./dist/instrument.js", "dist/main.js"]
