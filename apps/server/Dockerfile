# Build from the monorepo root:
#   docker build -f apps/server/Dockerfile -t kontext-server .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /repo

# ---- deps: everything @kontext/server (and its workspace deps) need to build ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
# The lockfile covers every workspace project, so pnpm needs each manifest present.
COPY apps/web/package.json apps/web/
RUN pnpm --filter @kontext/server... install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @kontext/server build

# ---- production deps only ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm --filter @kontext/server... install --frozen-lockfile --prod

# ---- runtime ----
# The pnpm node_modules layout relies on relative symlinks, so we keep the
# monorepo directory structure and run from apps/server.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
RUN addgroup -S kq && adduser -S kq -G kq
WORKDIR /repo/apps/server
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/server/node_modules /repo/apps/server/node_modules
COPY --from=prod-deps /repo/packages/shared/package.json /repo/packages/shared/package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY apps/server/package.json ./package.json
USER kq
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "dist/index.js"]
