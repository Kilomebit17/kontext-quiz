# @kontext/server

Real-time backend for Kontext Quiz: Fastify 5 HTTP API + Socket.IO 4 game engine.
The server is the single source of truth — clients send intents, the server broadcasts
`GameSnapshot`s. The contract is `docs/API.md` and `packages/shared`.

## Scripts

| Script             | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `pnpm dev`         | `tsx watch src/index.ts`                                          |
| `pnpm build`       | `tsup` → `dist/index.js`, `dist/db/migrate.js`, `dist/db/seed.js` |
| `pnpm start`       | `node dist/index.js`                                              |
| `pnpm typecheck`   | `tsc --noEmit`                                                    |
| `pnpm lint`        | eslint (flat config)                                              |
| `pnpm test`        | vitest — no Postgres/Redis needed                                 |
| `pnpm test:load`   | `load/room-load.ts` against a running server (see below)          |
| `pnpm db:generate` | `drizzle-kit generate` → SQL under `drizzle/` (commit it)         |
| `pnpm db:migrate`  | apply migrations (`DATABASE_URL` required)                        |
| `pnpm db:seed`     | upsert the demo quizzes                                           |

## Environment

Loaded from `apps/server/.env`, then the repo root `.env` (real env vars win). Validated with
zod in `src/config.ts`; see `/.env.example` for the full list.

| Var                                        | Notes                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                             | default `4000`, `0.0.0.0`                                                                                      |
| `WEB_ORIGIN`                               | CORS origin, magic-link/OAuth redirects, `joinUrl`                                                             |
| `API_ORIGIN`                               | used to build magic links and the Google callback URL                                                          |
| `DATABASE_URL`                             | Postgres. **Unset → memory mode** (see below). `STORE=memory` forces it                                        |
| `REDIS_URL`                                | optional; enables the Socket.IO redis adapter + cross-instance forwarding                                      |
| `JWT_SECRET`, `COOKIE_SECRET`              | ≥16 chars                                                                                                      |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`    | magic-link mail. No `SMTP_HOST` outside production → `devLink` in the response + log                           |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | both set → `/api/auth/google` is enabled, else 404                                                             |
| `SENTRY_DSN`                               | Sentry is initialised only when set                                                                            |
| `LOG_LEVEL`                                | pino level; pretty output in `NODE_ENV=development`                                                            |
| `INSTANCE_ID`                              | optional stable id for this instance (random by default)                                                       |
| `JOIN_RATE_LIMIT_PER_MIN`                  | Flood protection: total `player:join` attempts per IP per minute (default 300 — a classroom shares one NAT IP) |
| `PIN_GUESS_LIMIT_PER_MIN`                  | Brute-force protection: failed PIN guesses per IP per minute (default 10)                                      |

## Memory mode

Without `DATABASE_URL` the server runs on `MemoryStore` and logs a warning:

- guest hosts create games with inline quizzes, play, fetch `/result` and `/result.csv`;
- `/api/library` serves the two demo quizzes from `src/db/demoQuizzes.ts`;
- auth, quiz CRUD, history and challenge creation return `503 { code: 'NO_DATABASE' }`;
- Redis is optional as well (single instance, no adapter/forwarding).

This is what the tests and the web e2e suite use.

## Layout

```
src/
  index.ts          boot: env, config, sentry, createApp, graceful shutdown
  app.ts            createApp({ config, store, redis? }) → Fastify + Socket.IO
  config.ts         zod-validated env (+ testConfig())
  game/room.ts      GameRoom — pure engine (clock + scheduler injected)
  game/manager.ts   RoomManager — rooms by sessionId/pin, redis ownership, TTLs
  game/socket.ts    Socket.IO handlers, per-player snapshot fan-out
  game/forward.ts   cross-instance intent forwarding over redis pub/sub
  game/csv.ts       GameResult → CSV
  game/persist.ts   archive results through the Store
  store/            Store interface, MemoryStore, PgStore (Drizzle)
  db/               schema, client, migrate, seed, demo quizzes
  auth/             jose JWTs, cookie session plugin, nodemailer
  routes/           auth, quizzes, library, games, history, challenges, health
  ratelimit.ts      sliding-window limiter (memory or redis) for socket joins
```

### Game engine notes

- Phase timers are server-owned: `get_ready` → `GET_READY_MS`; `question` → `deadline + GRACE_MS`
  then auto `reveal`. `host:next` cancels timers. Info slides have `deadline: null` and no timer.
- Scoring/ranking/transitions come from `@kontext/shared` (`computeScore`, `evaluateAnswer`,
  `rankPlayers`, `transition`). A ×0 question never breaks a streak.
- `submitAnswer` is the hot path: validation + one small record, no snapshots. Broadcasts happen
  only on phase changes and lobby changes; `answer:count` is throttled to 100 ms.
- Snapshots: host gets question text and `finalRanking` always; players get `me`, question text
  only when `showQuestionOnPlayer`, `finalRanking` in podium/ended. `isCorrect` is never sent —
  correctness arrives only via `reveal`. In team mode `me.rank` is the team's rank.
- Text questions expose no options to players (the accepted spellings would be spoilers).
- Host disconnect: 10 min grace, then the room ends. Ended rooms are archived once and kept for
  10 min so `/result` and reconnects keep working.

### Auth & tokens

- Session: JWT `{ sub }` (30 d) in signed httpOnly cookie `kq_session`.
- Host token: JWT `{ sessionId, role: 'host' }` from `POST /api/games`; via `host:join` or
  `x-host-token`.
- Player token: JWT `{ sessionId, playerId, role: 'player' }` from the `player:join` ack.
- Challenge attempt token: JWT `{ challengeId, attemptId, role: 'attempt' }` as `Bearer`.

Challenge mode skips info slides (only scorable questions are served), timers are server-owned
(`questionStartedAt` per index, first GET starts the clock), late answers score 0.

## Scaling (multi-instance)

With `REDIS_URL` set:

- `RoomManager` records `kq:owner:{sessionId}`, `kq:pin:{pin}`, `kq:meta:{sessionId}` (TTL 6 h,
  refreshed every 30 min).
- Socket.IO uses `@socket.io/redis-adapter`, so the owning instance can emit to a socket that is
  connected elsewhere (`io.to(socketId)`).
- Intents that arrive on a non-owning instance are forwarded on `kq:instance:{ownerId}` with a
  `requestId`; the reply comes back on `kq:instance:{myId}` (5 s timeout → `WRONG_INSTANCE`).
- `GET /api/games/pin/:pin` reads the meta key when the room is remote; results are read from
  Postgres once persisted.
- Sticky sessions are still recommended for the polling transport.

Single-instance deployments never touch this path; the local branch is a direct method call.

## Load test

```
pnpm --filter @kontext/server dev      # in one shell (default limits allow 300 joins/min from one IP)
API_URL=http://localhost:4000 PLAYERS=200 QUESTIONS=5 pnpm --filter @kontext/server test:load
```

Prints p50/p95/p99 of the `state` broadcast latency (clock-offset corrected) and the
`player:answer` ack latency; exits 1 when p95 > 300 ms (`P95_LIMIT_MS` to override).
`load/artillery.yml` is a socket.io-engine scenario for the join path.

## Observability

- pino JSON logs (`reqId`, `sessionId`, `pin`, `socketId` in child loggers).
- `GET /healthz` → `{ ok, instanceId, uptime }`.
- `GET /metrics` → JSON, or Prometheus text with `Accept: text/plain`.
- Graceful shutdown on SIGTERM/SIGINT: sockets → rooms → HTTP → redis → postgres.

## Docker

```
docker build -f apps/server/Dockerfile -t kontext-server .
docker run -p 4000:4000 -e JWT_SECRET=... -e COOKIE_SECRET=... kontext-server
```

Run migrations with `node dist/db/migrate.js` inside the image (needs `DATABASE_URL`).
