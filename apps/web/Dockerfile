# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/web/Dockerfile -t raise/web .
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
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm turbo run build --filter=@raise/web...

FROM base AS runner
ENV NODE_ENV=production
# Not root (audit B5). next start writes its cache under .next, so the app is owned by node.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["pnpm", "--filter", "@raise/web", "start"]
