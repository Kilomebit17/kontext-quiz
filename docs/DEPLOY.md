# Deploying Kontext Quiz

Three supported targets. All of them run the same two images built from
`apps/server/Dockerfile` and `apps/web/Dockerfile`.

## Prerequisites (all targets)

| Variable                        | Purpose                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Managed PostgreSQL (Neon, Supabase, RDS…)                                                    |
| `REDIS_URL`                     | Upstash / in-cluster Redis — required for >1 server instance                                 |
| `JWT_SECRET`, `COOKIE_SECRET`   | `openssl rand -hex 32` each                                                                  |
| `WEB_ORIGIN`                    | Public URL of the web app, e.g. `https://play.kontextquiz.app`                               |
| `API_ORIGIN`                    | Public URL of the API, e.g. `https://api.kontextquiz.app`                                    |
| `SMTP_*`, `MAIL_FROM`           | Magic-link email (optional; without SMTP, links are only logged — not for production)        |
| `GOOGLE_CLIENT_ID/SECRET`       | Google sign-in (optional). Authorized redirect URI: `${API_ORIGIN}/api/auth/google/callback` |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | Error reporting (optional)                                                                   |

The web image bakes `VITE_API_URL` in at build time (`--build-arg VITE_API_URL=https://api.…`).

Migrations run via `node dist/db/migrate.js` before the server starts (Compose `command`, Fly `release_command`).

## 0. Simplest: one server, one hostname, prebuilt images

`deploy/single-host/docker-compose.yml` pulls the images CI publishes to GHCR
(`ghcr.io/<owner>/kontext-quiz/{web,server}`) and runs them behind Caddy on a
single hostname: `/api`, `/socket.io` and `/healthz` go to the server, everything
else to the static site. No domain? Use sslip.io: `SITE_ADDRESS=<server-ip>.sslip.io`.

```bash
mkdir kontext-quiz && cd kontext-quiz
# copy deploy/single-host/docker-compose.yml here, plus a .env (see .env.example)
docker compose up -d
docker compose exec server node dist/db/seed.js   # optional demo quizzes
```

The GHCR packages must be public (or the server must `docker login ghcr.io`).

## 1. VPS with Docker Compose + Caddy (auto-HTTPS)

```bash
git clone … && cd kontext-quiz
cp .env.example .env            # fill in secrets, WEB_ORIGIN, API_ORIGIN, POSTGRES_PASSWORD
export WEB_DOMAIN=play.example.com API_DOMAIN=api.example.com
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server node dist/db/seed.js   # optional demo quizzes
```

Point DNS `A` records for both domains at the VPS; Caddy obtains certificates automatically.

## 2. Fly.io

```bash
fly launch --config deploy/fly.server.toml --no-deploy
fly secrets set -a kontext-quiz-api JWT_SECRET=… COOKIE_SECRET=… DATABASE_URL=… REDIS_URL=…
fly deploy --config deploy/fly.server.toml

fly launch --config deploy/fly.web.toml --no-deploy
fly deploy --config deploy/fly.web.toml --build-arg VITE_API_URL=https://api.kontextquiz.app
fly certs add play.kontextquiz.app -a kontext-quiz-web
fly certs add api.kontextquiz.app -a kontext-quiz-api
```

Scale the API horizontally only with Redis configured (`fly scale count 2 -a kontext-quiz-api`).
Game rooms are pinned to the instance that created them; other instances forward intents over Redis.

CI deploys automatically on `main` when the repository variable `DEPLOY_TARGET=fly` and the
`FLY_API_TOKEN` secret are set (see `.github/workflows/ci.yml`).

## 3. Railway

Create two services from the repo, each with a Dockerfile path:

- `server`: `apps/server/Dockerfile`, add Postgres + Redis plugins, set the variables above,
  start command `sh -c "node dist/db/migrate.js && node dist/index.js"`.
- `web`: `apps/web/Dockerfile`, build arg `VITE_API_URL=https://<server-domain>`.

## Post-deploy checklist

1. `curl https://api.…/healthz` → `{ ok: true }`.
2. Open the web app on a laptop, create a quiz, start a game; join from a phone via the QR code.
3. `curl https://api.…/metrics` shows `activeRooms` while a game is running.
4. Run the load test against production once: `API_URL=https://api.… PLAYERS=200 pnpm test:load`.
