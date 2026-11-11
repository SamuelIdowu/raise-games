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
COPY --from=build /app ./
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
