# Kontext Quiz

Real-time multiplayer quiz game: the host shows a question on the big screen, players answer from
their phones. Ukrainian by default, English as a second locale. No player-count limits.

```
apps/web        React + Vite + Tailwind + Zustand + Framer Motion (PWA)
apps/server     Fastify + Socket.IO + Drizzle (PostgreSQL) + Redis
packages/shared Shared types, Socket.IO event contract, scoring, state machine, validation
docs/           API contract, deployment guide
deploy/         Caddy, nginx, Fly.io configs
```

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d            # PostgreSQL + Redis
pnpm db:migrate && pnpm db:seed # schema + demo quizzes
pnpm dev                        # web on :3000, API on :4000
```

Without Docker: `STORE=memory pnpm dev` runs the API with an in-memory store (guest hosting,
live games, results, demo library — no accounts).

Open http://localhost:3000, go to **Провести гру**, pick the demo quiz, and join from a phone on
the same network via the QR code (`pnpm dev` binds the web app on all interfaces).

## Scripts

| Command                                      | What it does                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | All apps in watch mode                                                                                        |
| `pnpm build`                                 | Typecheck + production builds                                                                                 |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Across the workspace                                                                                          |
| `pnpm test:e2e`                              | Playwright: full game with a host and 3 players (starts servers itself; `E2E_API_PORT=4100` if :4000 is busy) |
| `pnpm test:load`                             | 200 players in one room, asserts p95 state latency < 300 ms                                                   |
| `pnpm db:migrate` / `pnpm db:seed`           | Drizzle migrations / demo data                                                                                |

## Game modes

- **Live** — host controls the pace; players answer synchronously.
- **Team** — players are grouped into teams (2–5), 5 s discussion window, team score = average.
- **Challenge** — asynchronous link with a deadline, server-owned per-question timers, shared leaderboard.
- **Solo** — practice alone, client-side.

## Scoring

`points = round(1000 × weight × (1 − (t / T) / 2))` — 500…1000 per correct answer depending on speed,
×0 / ×1 / ×2 weights, +100 streak bonus from the third consecutive correct answer, proportional
credit for multiple-choice when no wrong option was picked. See `packages/shared/src/scoring.ts`.

## Architecture

The server is the single source of truth. Clients send intents (`player:join`, `player:answer`,
`host:next` …) and receive `state` snapshots. Timers are server-owned; clients compensate for clock
skew with a median offset from `time:ping`. Answers after `deadline + 500 ms` are rejected. A game
room lives on one instance; with Redis, other instances forward intents to the owner and Socket.IO
uses the Redis adapter for broadcasts. See [docs/API.md](docs/API.md).

## Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) — Docker Compose + Caddy on a VPS, Fly.io, or Railway.
CI (GitHub Actions) runs lint, typecheck, unit tests, Playwright e2e, the 200-player load test,
builds Docker images to GHCR, and optionally deploys to Fly.io.

## License

MIT
