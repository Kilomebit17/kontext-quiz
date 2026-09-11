import type {
  AnswerResult,
  Challenge,
  GameMode,
  GameResult,
  GameSettings,
  GameStatus,
  LeaderboardEntry,
  PublicQuestion,
  Quiz,
  QuizInput,
  QuizSummary,
  User,
} from '@kontext/shared'

export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

function codeForStatus(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 400 || status === 422) return 'VALIDATION'
  return 'INTERNAL'
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', 'Network error')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const payload = data as { error?: { code?: string; message?: string } } | null
    const code = payload?.error?.code ?? codeForStatus(res.status)
    const message = payload?.error?.message ?? res.statusText
    throw new ApiError(res.status, code, message)
  }
  return data as T
}

async function requestBlob(path: string, headers: Record<string, string> = {}): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error')
  }
  if (!res.ok) {
    throw new ApiError(res.status, codeForStatus(res.status), res.statusText)
  }
  return res.blob()
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  magicLink: (email: string) =>
    request<{ ok: true; devLink?: string }>('/api/auth/magic-link', {
      method: 'POST',
      body: { email },
    }),
  /** Sign-up and sign-in in one call: unknown nickname → account created. */
  password: (nickname: string, password: string) =>
    request<{ user: User; created: boolean }>('/api/auth/password', {
      method: 'POST',
      body: { nickname, password },
    }),
  providers: () =>
    request<{ password: boolean; email: boolean; google: boolean }>('/api/auth/providers'),
  me: () => request<{ user: User | null }>('/api/auth/me'),
  updateAvatar: (avatar: string) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', body: { avatar } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  googleUrl: () => `${API_BASE}/api/auth/google`,
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export interface LibraryPage {
  quizzes: QuizSummary[]
  total: number
  page: number
  limit: number
}

export const quizzes = {
  list: () => request<{ quizzes: QuizSummary[] }>('/api/quizzes'),
  create: (input: QuizInput) =>
    request<{ quiz: Quiz }>('/api/quizzes', { method: 'POST', body: input }),
  get: (id: string) => request<{ quiz: Quiz }>(`/api/quizzes/${encodeURIComponent(id)}`),
  update: (id: string, input: QuizInput) =>
    request<{ quiz: Quiz }>(`/api/quizzes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    }),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  duplicate: (id: string) =>
    request<{ quiz: Quiz }>(`/api/quizzes/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  library: (params: { q?: string; page?: number; limit?: number } = {}) => {
    const search = new URLSearchParams()
    if (params.q) search.set('q', params.q)
    if (params.page) search.set('page', String(params.page))
    if (params.limit) search.set('limit', String(params.limit))
    const qs = search.toString()
    return request<LibraryPage>(`/api/library${qs ? `?${qs}` : ''}`)
  },
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export interface CreateGameResponse {
  sessionId: string
  pin: string
  hostToken: string
  joinUrl: string
}

export interface PinLookup {
  exists: boolean
  status?: GameStatus
  quizTitle?: string
  mode?: GameMode
}

export const games = {
  create: (body: { quizId?: string; quiz?: QuizInput; settings?: Partial<GameSettings> }) =>
    request<CreateGameResponse>('/api/games', { method: 'POST', body }),
  lookupPin: (pin: string, signal?: AbortSignal) =>
    request<PinLookup>(`/api/games/pin/${encodeURIComponent(pin)}`, { signal }),
  result: (sessionId: string, hostToken?: string) =>
    request<{ result: GameResult }>(`/api/games/${encodeURIComponent(sessionId)}/result`, {
      headers: hostToken ? { 'x-host-token': hostToken } : {},
    }),
  resultCsv: (sessionId: string, hostToken?: string) =>
    requestBlob(
      `/api/games/${encodeURIComponent(sessionId)}/result.csv`,
      hostToken ? { 'x-host-token': hostToken } : {},
    ),
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type HistoryItem = Omit<GameResult, 'players' | 'questions'>

export const history = {
  list: () => request<{ games: HistoryItem[] }>('/api/history'),
  get: (id: string) => request<{ result: GameResult }>(`/api/history/${encodeURIComponent(id)}`),
  csv: (id: string) => requestBlob(`/api/history/${encodeURIComponent(id)}/csv`),
  remove: (id: string) =>
    request<{ ok: true }>(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

export interface ChallengeQuestionResponse {
  finished: false
  question: PublicQuestion
  serverTime: number
  startedAt: number
  deadline: number
}

export interface ChallengeFinishedResponse {
  finished: true
  score: number
  rank: number
}

export interface ChallengeAnswerResponse {
  result: AnswerResult
  correctOptionIds: string[]
  acceptedAnswers: string[]
  finished: boolean
  /** Answer arrived after deadline + grace and was scored as 0. */
  late?: boolean
}

export const challenges = {
  create: (body: { quizId: string; deadline: string }) =>
    request<{ challenge: Challenge; url: string }>('/api/challenges', { method: 'POST', body }),
  list: () => request<{ challenges: Challenge[] }>('/api/challenges'),
  get: (code: string) =>
    request<{ challenge: Challenge; questionCount: number; expired: boolean }>(
      `/api/challenges/${encodeURIComponent(code)}`,
    ),
  startAttempt: (code: string, nickname: string) =>
    request<{ attemptId: string; token: string; nickname: string }>(
      `/api/challenges/${encodeURIComponent(code)}/attempts`,
      { method: 'POST', body: { nickname } },
    ),
  question: (code: string, attemptId: string, token: string) =>
    request<ChallengeQuestionResponse | ChallengeFinishedResponse>(
      `/api/challenges/${encodeURIComponent(code)}/attempts/${encodeURIComponent(attemptId)}/question`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  answer: (
    code: string,
    attemptId: string,
    token: string,
    body: { questionIndex: number; optionIds?: string[]; text?: string },
  ) =>
    request<ChallengeAnswerResponse>(
      `/api/challenges/${encodeURIComponent(code)}/attempts/${encodeURIComponent(attemptId)}/answer`,
      { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } },
    ),
  leaderboard: (code: string) =>
    request<{ entries: LeaderboardEntry[] }>(
      `/api/challenges/${encodeURIComponent(code)}/leaderboard`,
    ),
}

export const api = { auth, quizzes, games, history, challenges }
export default api
