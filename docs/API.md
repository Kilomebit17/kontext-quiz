# Kontext Quiz — API & realtime contract

All shared types live in `packages/shared/src` (`@kontext/shared`). This document fixes the HTTP
routes and Socket.IO semantics so `apps/server` and `apps/web` can be built independently.

Base URL: `VITE_API_URL` (dev: `http://localhost:4000`). All JSON. Errors are
`{ error: { code: string, message: string } }` with an appropriate HTTP status.

Auth cookie: `kq_session` (httpOnly, SameSite=Lax, Secure in production), JWT `{ sub: userId }`.
Web must send requests with `credentials: 'include'`.

Host token: a JWT `{ sessionId, role: 'host' }` returned by `POST /api/games`, kept by the browser
(sessionStorage). Sent either via Socket.IO `host:join` or the `x-host-token` header on HTTP.

Player token: JWT `{ sessionId, playerId, role: 'player' }` returned by the `player:join` ack.
Stored in sessionStorage; used for `player:resume` after a refresh.

## HTTP

### Auth

| Method | Path                                  | Body / Query                                                                                                | Response                                                                                                                                                                                                                      |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/magic-link`                | `{ email }`                                                                                                 | `202 { ok: true, devLink?: string }` — `devLink` is only present when SMTP is not configured (non-production).                                                                                                                |
| GET    | `/api/auth/magic-link/verify?token=…` |                                                                                                             | Sets cookie, `302` → `${WEB_ORIGIN}/host`. On invalid: `302` → `${WEB_ORIGIN}/login?error=invalid_link`.                                                                                                                      |
| GET    | `/api/auth/google`                    |                                                                                                             | `302` to Google (404 if not configured).                                                                                                                                                                                      |
| GET    | `/api/auth/google/callback`           |                                                                                                             | Sets cookie, `302` → `${WEB_ORIGIN}/host`.                                                                                                                                                                                    |
| POST   | `/api/auth/password`                  | `{ nickname, password }` — leading `@` stripped; handle 2–20 chars `[letters digits _ . -]`, password 6–128 | Unknown handle → `201 { user, created: true }`; known → `200 { user, created: false }` or `401 INVALID_CREDENTIALS`; email/Google account → `409 PASSWORD_NOT_SET`. Sets the session cookie. 10/min/IP. Works in memory mode. |
| GET    | `/api/auth/providers`                 |                                                                                                             | `{ password, email, google }` booleans — which methods this deployment offers                                                                                                                                                 |
| GET    | `/api/auth/me`                        |                                                                                                             | `{ user: User \| null }` — `User = { id, nickname, name, email \| null, createdAt }`                                                                                                                                          |
| PATCH  | `/api/auth/me`                        | `{ avatar }` — an id from the shared avatar catalogue, e.g. `navy-wink-3`                                   | `{ user }` with the new avatar; 401 for guests, 400 for unknown ids                                                                                                                                                           |
| POST   | `/api/auth/logout`                    |                                                                                                             | `{ ok: true }` clears cookie                                                                                                                                                                                                  |

### Quizzes (require auth unless noted)

| Method | Path                           | Body        | Response                                                                         |
| ------ | ------------------------------ | ----------- | -------------------------------------------------------------------------------- |
| GET    | `/api/quizzes`                 |             | `{ quizzes: QuizSummary[] }` — the caller's quizzes                              |
| POST   | `/api/quizzes`                 | `QuizInput` | `201 { quiz: Quiz }`                                                             |
| GET    | `/api/quizzes/:id`             |             | `{ quiz: Quiz }` — owner, or `visibility ∈ {public, link}` (no auth needed then) |
| PUT    | `/api/quizzes/:id`             | `QuizInput` | `{ quiz: Quiz }`                                                                 |
| DELETE | `/api/quizzes/:id`             |             | `{ ok: true }`                                                                   |
| POST   | `/api/quizzes/:id/duplicate`   |             | `201 { quiz: Quiz }` — copies to the caller's quizzes (works for public quizzes) |
| GET    | `/api/library?q=&page=&limit=` |             | `{ quizzes: QuizSummary[], total, page, limit }` — public quizzes, no auth       |

CSV/XLSX import is done client-side (web parses the file and produces `Question[]`).

### Games

| Method | Path                               | Body                                                                                                                                                | Response                                                                                                                                               |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/games`                       | `{ quizId?, quiz?: QuizInput, settings?: Partial<GameSettings> }` (exactly one of quizId/quiz; auth optional — guests may host with an inline quiz) | `201 { sessionId, pin, hostToken, joinUrl }` — `joinUrl = ${WEB_ORIGIN}/join?pin=123456`                                                               |
| GET    | `/api/games/pin/:pin`              |                                                                                                                                                     | `{ exists: boolean, status?: GameStatus, quizTitle?: string, mode?: GameMode }` — rate limited (20/min/IP)                                             |
| GET    | `/api/games/:sessionId/result`     | header `x-host-token` or auth cookie of the host                                                                                                    | `{ result: GameResult }` (404 until the game ended)                                                                                                    |
| GET    | `/api/games/:sessionId/result.csv` | same                                                                                                                                                | `text/csv; charset=utf-8` with BOM. Columns: `rank,nickname,score,correct,total,` then one `q{n}` column per question with points, then `q{n}_time_ms` |

### History (auth)

| Method | Path                   | Response                                                               |
| ------ | ---------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/history`         | `{ games: Omit<GameResult, 'players' \| 'questions'>[] }` newest first |
| GET    | `/api/history/:id`     | `{ result: GameResult }`                                               |
| GET    | `/api/history/:id/csv` | CSV as above                                                           |
| DELETE | `/api/history/:id`     | `{ ok: true }`                                                         |

### Challenges (asynchronous mode)

| Method | Path                                                 | Body                                           | Response                                                                                                                                                                                                                            |
| ------ | ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/challenges`                                    | `{ quizId, deadline: ISO }` (auth)             | `201 { challenge: Challenge, url }` — `url = ${WEB_ORIGIN}/challenge/${code}`                                                                                                                                                       |
| GET    | `/api/challenges`                                    | (auth)                                         | `{ challenges: Challenge[] }`                                                                                                                                                                                                       |
| GET    | `/api/challenges/:code`                              |                                                | `{ challenge: Challenge, questionCount, expired: boolean }`                                                                                                                                                                         |
| POST   | `/api/challenges/:code/attempts`                     | `{ nickname }`                                 | `201 { attemptId, token, nickname }` — `token` is a JWT `{ challengeId, attemptId, role: 'attempt' }`, sent as `Authorization: Bearer` below. Nickname rules identical to live games.                                               |
| GET    | `/api/challenges/:code/attempts/:attemptId/question` | bearer                                         | `{ question: PublicQuestion (text always included), serverTime, startedAt, deadline, finished: false }` — the first call for an index starts the timer server-side. When all questions are done: `{ finished: true, score, rank }`. |
| POST   | `/api/challenges/:code/attempts/:attemptId/answer`   | bearer, `{ questionIndex, optionIds?, text? }` | `{ result: AnswerResult, correctOptionIds, acceptedAnswers, finished: boolean }`. Late (after deadline + 500 ms) → scored as 0 and marked; double → `409 ALREADY_ANSWERED`.                                                         |
| GET    | `/api/challenges/:code/leaderboard`                  |                                                | `{ entries: LeaderboardEntry[] }` (finished attempts only; `previousRank` null)                                                                                                                                                     |

### Misc

| Method | Path       | Response                                                                                                 |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/healthz` | `{ ok: true, instanceId, uptime }`                                                                       |
| GET    | `/metrics` | `{ activeRooms, activePlayers, connections, instanceId }` (plus Prometheus text if `Accept: text/plain`) |

## Socket.IO

Path `/socket.io`, same origin as the API, transports `['websocket', 'polling']`. Typed with
`ClientToServerEvents` / `ServerToClientEvents` from `@kontext/shared`.

- Clients send intents; **every** intent has an ack `{ ok: true, … } | { ok: false, error }`.
- The server broadcasts `state` (a `GameSnapshot`) to everyone in the room on every phase change and
  on lobby membership changes. Players receive a snapshot with `me` filled; the host receives the
  full snapshot (`finalRanking` in podium/ended, question `text` always present).
- `answer:count` is emitted to the host only, throttled to ≤10/s, during the `question` phase.
- Clock sync: on connect the client sends `time:ping { t0 }` 5 times, computes
  `offset = serverTime - (t0 + rtt/2)` per sample, and keeps the median. Remaining time =
  `deadline - (Date.now() + offset)`.
- Answers accepted only while `status === 'question'`, `questionIndex` matches, the player has not
  answered this question, `now <= deadline + GRACE_MS`, and (team mode) `now >= discussionUntil`.
  `answerTimeMs = receivedAt - (discussionUntil ?? questionStartedAt)`.
- Phase timers are server-owned: `get_ready` lasts `GET_READY_MS`, then `question` until `deadline`,
  then the server transitions to `reveal` automatically. `host:next` from `question` ends the timer early.
  From `reveal` → `leaderboard` → next `get_ready` / `podium` → `ended` the host clicks Next.
- Info slides: `question` phase with `type: 'info'` and no deadline (deadline = null); `host:next` goes to the
  next question's `get_ready` (or `podium`). No reveal/leaderboard for info slides.
- Reconnect: `player:resume { token }` re-joins the room, marks the player connected, and acks with
  the current snapshot (score, streak, `hasAnswered` intact). `host:join` likewise for the host.
- Kick: `host:kick { playerId }` emits `kicked` to that player, removes them, and blocks both the
  player id and the nickname (case-insensitive) for that session; the blocked token cannot resume.
- Lobby only: `player:join` fails with `GAME_ALREADY_STARTED` once the game left the lobby.
  Failed PIN guesses are rate limited per IP (10/min) and total join attempts per IP (300/min) → `RATE_LIMITED`.
- Team mode: on join the server assigns players to the team with the fewest members below
  `teamSize` (creating `Команда N` as needed); `player:team { teamId }` may switch in the lobby.
  Question phase has `discussionUntil = questionStartedAt + DISCUSSION_MS` and
  `deadline = discussionUntil + timeLimit × 1000`. `teams[].score` is the rounded average of member
  scores; `leaderboard` / `finalRanking` list **teams** (`playerId = teamId`, `nickname = team name`).
- Host disconnect: the room stays alive for 10 minutes for the host to reconnect; then it ends.
- On `ended` the server archives a `GameResult` (Postgres) and keeps the room in memory for 10 minutes
  so late `result` requests and reconnecting clients still work.

## Web routes

| Path                                 | Screen                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `/`                                  | Landing: PIN entry, "Host a game" link                                        |
| `/join?pin=123456`                   | PIN prefilled from QR → nickname                                              |
| `/play`                              | Player game screen (resumes from sessionStorage token)                        |
| `/host`                              | Host dashboard: my quizzes (localStorage when logged out, API when logged in) |
| `/host/quiz/new`, `/host/quiz/:id`   | Quiz editor                                                                   |
| `/host/game/:sessionId`              | Host screen (lobby → podium)                                                  |
| `/host/history`, `/host/history/:id` | Game history                                                                  |
| `/host/challenges`                   | Challenge links                                                               |
| `/library`                           | Public library                                                                |
| `/solo/:quizId`                      | Solo practice (client-side engine)                                            |
| `/challenge/:code`                   | Asynchronous challenge                                                        |
| `/login`                             | Magic link / Google                                                           |
