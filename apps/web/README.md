# @kontext/web

The browser app for **Kontext Quiz**: the host's projector screen, the players' phone
screen, the quiz editor, solo practice and asynchronous challenges.

Vite 7 · React 19 · TypeScript · react-router 7 · Zustand 5 · Tailwind CSS 4 · motion ·
react-i18next · socket.io-client · vite-plugin-pwa.

## Scripts

| Script                           | What it does                                                      |
| -------------------------------- | ----------------------------------------------------------------- |
| `pnpm --filter @kontext/web dev` | Vite dev server on http://localhost:3000 (`--host`, LAN-visible)  |
| `… build`                        | `tsc -b && vite build` → `dist/` (with service worker)            |
| `… preview`                      | Serve the production build locally                                |
| `… typecheck`                    | `tsc -b` (app + node configs)                                     |
| `… lint`                         | ESLint (typescript-eslint, react-hooks, react-refresh)            |
| `… test`                         | Vitest unit tests (`src/**/*.test.ts`)                            |
| `… test:e2e`                     | Playwright (boots the API with `STORE=memory` and the dev server) |
| `… icons`                        | Regenerate PNG icons from `public/icons/icon.svg` with sharp      |

Before the first `test:e2e`: `pnpm exec playwright install chromium`.

## Environment

Vite only exposes variables prefixed with `VITE_` (see the root `.env.example`).

| Variable          | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `VITE_API_URL`    | Base URL of the API. Empty/unset ⇒ same-origin (`/api`, `/socket.io` are proxied in dev).     |
| `VITE_SENTRY_DSN` | When set, `@sentry/react` is lazy-loaded and initialised; otherwise Sentry is never imported. |

The dev server proxies `/api` and `/socket.io` (WebSocket) to `http://localhost:4000`
(`VITE_DEV_PROXY_TARGET` overrides the target). All `fetch` calls use
`credentials: 'include'`; the socket connects to `VITE_API_URL || window.location.origin`.

## Structure

```
src/
  main.tsx            bootstrap: fonts/theme, i18n (waits for the locale bundle), PWA SW, Sentry
  App.tsx             routes (every page is React.lazy — /play stays small)
  styles/theme.css    design tokens (CSS variables) + Tailwind @theme mapping + base styles
  i18n/               index.ts (detector, lazy locale bundles), uk.json, en.json, i18n.test.ts
  lib/
    api.ts            typed fetch wrapper for every HTTP route; throws ApiError {status, code}
    socket.ts         singleton typed Socket.IO client, emitWithAck, clock sync (5 pings, median)
    clock.ts          serverNow() = Date.now() + clockOffset
    sound.ts          Web Audio synthesized cues (lazy AudioContext, unlocked on first gesture)
    import.ts         CSV/XLSX → Question[] (papaparse + SheetJS, loaded on demand)
    soloEngine.ts     pure client-side game engine (computeScore/evaluateAnswer from shared)
    quizRepo.ts       LocalQuizRepo (localStorage `kq.quizzes`) and ApiQuizRepo
    youtube.ts, storage.ts, download.ts, confetti.ts (dynamic), sentry.ts, format.ts, ids.ts
  stores/             Zustand: gameStore (snapshot/role/tokens), quizStore, authStore,
                      settingsStore (sound + locale), announcerStore (aria-live), toastStore
  hooks/              useCountdown, usePageTitle, useReducedMotion, useFullscreen, useHotkey,
                      useErrorMessage, useOptionLabel, useGameFeedback (announcer + toasts)
  components/         Wordmark, shapes/ (Wave, Spark, Ring, Rhombus), OptionButton, PinInput,
                      TimerRing, Countdown, Leaderboard (FLIP), Podium, RevealChart, Media,
                      AppShell (host chrome), PlayerShell (phone chrome), Modal, Field, …
  pages/              Landing, Join, Play, HostDashboard, Editor, HostGame, History,
                      HistoryDetail, Challenges, Library, Solo, Challenge, Login, NotFound
e2e/                  Playwright specs (full-game.spec.ts, player.mobile.spec.ts)
public/               icons/ (SVG + generated PNGs), fonts/ (self-hosted woff2 subsets)
```

### Realtime model

The server is the source of truth. Clients only send intents (`player:join`, `player:answer`,
`host:next`, …) and render the `state` snapshots they receive; only `state` (and the snapshot
returned by `player:resume` / `host:join` acks) mutates `gameStore.snapshot`.

- Player token → `sessionStorage['kq.player']`; `/play` resumes it on load and on reconnect.
- Host token (+ join URL) → `sessionStorage['kq.host.<sessionId>']`; `/host/game/:id` joins with it.
- Timers use `serverNow()`; the offset is the median of 5 `time:ping` samples taken on connect.

## Design tokens

Defined once in `src/styles/theme.css` and mapped to Tailwind utilities via `@theme inline`
(`bg-bg`, `bg-bg-elev`, `text-fg`, `text-fg-muted`, `bg-coral`, `bg-teal`, `bg-amber`,
`bg-violet`, `text-success`, `text-error`, `ring-amber`, `font-heading`, `font-body`).

| Token                   | Value                 | Use                                        |
| ----------------------- | --------------------- | ------------------------------------------ |
| `--bg`                  | `#141B33`             | page background                            |
| `--bg-elev`             | `#1C2447`             | cards                                      |
| `--bg-elev-2`           | `#242E5A`             | inputs, chips, secondary buttons           |
| `--fg`                  | `#F4F6FF`             | text                                       |
| `--fg-muted`            | `#A9B1D6`             | secondary text                             |
| `--coral`               | `#FF6B6B`             | option 0 · wave                            |
| `--teal`                | `#2EC4B6`             | option 1 · spark                           |
| `--amber`               | `#FFB627`             | option 2 · ring · primary CTA · focus ring |
| `--violet`              | `#7C6FF0`             | option 3 · rhombus                         |
| `--success` / `--error` | `#3DDC97` / `#FF5C7A` | feedback                                   |

Answer options always combine a colour **and** a shape (never colour alone). Dark text
(`--fg-on-accent`) is used on amber/teal/coral for AA contrast; violet uses light text.
Fonts: _Unbounded Variable_ for headings, PIN and numbers; _Inter Variable_ for body — both
self-hosted from `public/fonts` (Cyrillic + Latin subsets, `font-display: swap`, preloaded).

## i18n workflow

- Every UI string lives in `src/i18n/uk.json` (default) and `src/i18n/en.json`; components call
  `t('section.key')`. There are no literal UI strings in components.
- `i18n.test.ts` fails when the two files' key sets differ or interpolation placeholders diverge,
  so adding a key means adding it to both files.
- Plurals use i18next v4 suffixes: `_one`, `_few`, `_many`, `_other` (Ukrainian needs all four;
  English keeps the same keys so the key sets stay identical).
- Language is detected from `?lng=`, then `localStorage['kq.locale']`, then the browser; the
  header switcher (UA / EN) calls `settingsStore.setLocale`, which loads the bundle first and
  then switches, so raw keys never flash. `<html lang>` follows the active language.
- Locale bundles are code-split (`import('./uk.json')`) so a player downloads one language.

## Testing

- Unit (Vitest, jsdom): import parser, solo engine, clock offset, i18n key parity.
- E2E (Playwright): `e2e/full-game.spec.ts` drives a guest host through the editor, a live game
  with three players in separate contexts (including a mid-question reload), the podium, the
  results table and the CSV download, asserting zero `console.error`s on every page.
  `e2e/player.mobile.spec.ts` checks the phone layout (Pixel 7 project).
