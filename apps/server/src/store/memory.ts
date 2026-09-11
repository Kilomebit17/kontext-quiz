import { randomUUID } from 'node:crypto'
import { randomAvatar, type GameResult, type Quiz, type User } from '@kontext/shared'

type StoredUser = User & { googleId: string | null; passwordHash: string | null }
import { DEMO_QUIZZES } from '../db/demoQuizzes.js'
import {
  toSummary,
  type ChallengeAttemptRecord,
  type ChallengeRecord,
  type GameResultSummary,
  type GameSessionRecord,
  type LibraryQuery,
  type QuizWrite,
  type Store,
  type CreateUserInput,
} from './types.js'

const clone = <T>(v: T): T => structuredClone(v)

/**
 * In-memory Store. Used when DATABASE_URL is unset and in tests.
 * Everything is lost on restart.
 */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const

  private usersById = new Map<string, StoredUser>()
  private magic = new Map<string, { email: string; expiresAt: Date; usedAt: Date | null }>()
  private quizzesById = new Map<string, Quiz>()
  private sessions = new Map<string, GameSessionRecord>()
  private results = new Map<string, GameResult>()
  private challengesById = new Map<string, ChallengeRecord>()
  private attemptsById = new Map<string, ChallengeAttemptRecord>()

  constructor(opts: { seedDemo?: boolean } = {}) {
    if (opts.seedDemo ?? true) this.seedDemo()
  }

  seedDemo(): void {
    const now = new Date().toISOString()
    for (const demo of DEMO_QUIZZES) {
      if (this.quizzesById.has(demo.id)) continue
      this.quizzesById.set(demo.id, {
        id: demo.id,
        ownerId: null,
        title: demo.title,
        coverUrl: demo.coverUrl ?? null,
        visibility: demo.visibility,
        questions: clone(demo.questions),
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  users = {
    findById: async (id: string) => {
      const u = this.usersById.get(id)
      return u ? this.publicUser(u) : null
    },
    findByEmail: async (email: string) => {
      const lower = email.toLowerCase()
      for (const u of this.usersById.values()) {
        if (u.email && u.email.toLowerCase() === lower) return this.publicUser(u)
      }
      return null
    },
    findByGoogleId: async (googleId: string) => {
      for (const u of this.usersById.values()) {
        if (u.googleId === googleId) return this.publicUser(u)
      }
      return null
    },
    findByNickname: async (nickname: string) => {
      const lower = nickname.toLowerCase()
      for (const u of this.usersById.values()) {
        if (u.nickname.toLowerCase() === lower) {
          return { user: this.publicUser(u), passwordHash: u.passwordHash }
        }
      }
      return null
    },
    create: async (input: CreateUserInput) => {
      const u: StoredUser = {
        id: randomUUID(),
        nickname: input.nickname,
        avatar: randomAvatar(),
        email: input.email ? input.email.toLowerCase() : null,
        name: input.name,
        createdAt: new Date().toISOString(),
        googleId: input.googleId ?? null,
        passwordHash: input.passwordHash ?? null,
      }
      this.usersById.set(u.id, u)
      return this.publicUser(u)
    },
    setGoogleId: async (id: string, googleId: string) => {
      const u = this.usersById.get(id)
      if (u) u.googleId = googleId
    },
    updateAvatar: async (id: string, avatar: string) => {
      const u = this.usersById.get(id)
      if (!u) return null
      u.avatar = avatar
      return this.publicUser(u)
    },
  }

  private publicUser(u: StoredUser): User {
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
    }
  }

  magicLinks = {
    create: async (token: string, email: string, expiresAt: Date) => {
      this.magic.set(token, { email: email.toLowerCase(), expiresAt, usedAt: null })
    },
    consume: async (token: string, now: Date) => {
      const row = this.magic.get(token)
      if (!row || row.usedAt || row.expiresAt.getTime() < now.getTime()) return null
      row.usedAt = now
      return row.email
    },
  }

  quizzes = {
    listByOwner: async (ownerId: string) =>
      [...this.quizzesById.values()]
        .filter((q) => q.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((q) => toSummary(q)),
    get: async (id: string) => {
      const q = this.quizzesById.get(id)
      return q ? clone(q) : null
    },
    create: async (ownerId: string | null, input: QuizWrite) => {
      const now = new Date().toISOString()
      const quiz: Quiz = {
        id: randomUUID(),
        ownerId,
        title: input.title,
        coverUrl: input.coverUrl ?? null,
        visibility: input.visibility,
        questions: clone(input.questions),
        createdAt: now,
        updatedAt: now,
      }
      this.quizzesById.set(quiz.id, quiz)
      return clone(quiz)
    },
    update: async (id: string, input: QuizWrite) => {
      const q = this.quizzesById.get(id)
      if (!q) return null
      q.title = input.title
      q.coverUrl = input.coverUrl ?? null
      q.visibility = input.visibility
      q.questions = clone(input.questions)
      q.updatedAt = new Date().toISOString()
      return clone(q)
    },
    delete: async (id: string) => this.quizzesById.delete(id),
    listPublic: async ({ q, page, limit }: LibraryQuery) => {
      const needle = q?.trim().toLowerCase()
      const all = [...this.quizzesById.values()]
        .filter((quiz) => quiz.visibility === 'public')
        .filter((quiz) => !needle || quiz.title.toLowerCase().includes(needle))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const start = (page - 1) * limit
      return {
        quizzes: all.slice(start, start + limit).map((quiz) => toSummary(quiz)),
        total: all.length,
      }
    },
  }

  gameSessions = {
    create: async (record: GameSessionRecord) => {
      this.sessions.set(record.id, clone(record))
    },
    update: async (id: string, patch: Partial<GameSessionRecord>) => {
      const s = this.sessions.get(id)
      if (s) Object.assign(s, patch)
    },
  }

  gameResults = {
    save: async (result: GameResult) => {
      this.results.set(result.id, clone(result))
    },
    get: async (id: string) => {
      const r = this.results.get(id)
      return r ? clone(r) : null
    },
    getBySessionId: async (sessionId: string) => {
      for (const r of this.results.values()) if (r.sessionId === sessionId) return clone(r)
      return null
    },
    listByHost: async (hostId: string): Promise<GameResultSummary[]> =>
      [...this.results.values()]
        .filter((r) => r.hostId === hostId)
        .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
        .map(({ players: _p, questions: _q, ...rest }) => clone(rest)),
    delete: async (id: string, hostId: string) => {
      const r = this.results.get(id)
      if (!r || r.hostId !== hostId) return false
      return this.results.delete(id)
    },
  }

  challenges = {
    create: async (record: ChallengeRecord) => {
      this.challengesById.set(record.id, clone(record))
    },
    getByCode: async (code: string) => {
      for (const c of this.challengesById.values()) if (c.code === code) return clone(c)
      return null
    },
    getById: async (id: string) => {
      const c = this.challengesById.get(id)
      return c ? clone(c) : null
    },
    listByHost: async (hostId: string) =>
      [...this.challengesById.values()]
        .filter((c) => c.hostId === hostId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone),
    countAttempts: async (challengeId: string) => {
      let n = 0
      for (const a of this.attemptsById.values()) if (a.challengeId === challengeId) n++
      return n
    },
    createAttempt: async (record: ChallengeAttemptRecord) => {
      this.attemptsById.set(record.id, clone(record))
    },
    getAttempt: async (id: string) => {
      const a = this.attemptsById.get(id)
      return a ? clone(a) : null
    },
    updateAttempt: async (record: ChallengeAttemptRecord) => {
      this.attemptsById.set(record.id, clone(record))
    },
    listAttempts: async (challengeId: string) =>
      [...this.attemptsById.values()].filter((a) => a.challengeId === challengeId).map(clone),
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}
