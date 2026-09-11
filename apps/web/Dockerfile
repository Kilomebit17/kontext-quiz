# Build from the monorepo root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t kontext-web .
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm --filter @kontext/web... install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_API_URL=""
ARG VITE_SENTRY_DSN=""
ENV VITE_API_URL=$VITE_API_URL VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN pnpm --filter @kontext/web build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
