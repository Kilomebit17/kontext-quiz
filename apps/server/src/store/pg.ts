import { and, count, desc, eq, gte, ilike, isNull, sql as dsql } from 'drizzle-orm'
import { randomAvatar, type GameResult, type Quiz, type User } from '@kontext/shared'
import { createDb, type Db } from '../db/client.js'
import * as t from '../db/schema.js'
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

type QuizRow = typeof t.quizzes.$inferSelect
type ResultRow = typeof t.gameResults.$inferSelect
type ChallengeRow = typeof t.challenges.$inferSelect
type AttemptRow = typeof t.challengeAttempts.$inferSelect

const userOf = (r: typeof t.users.$inferSelect): User => ({
  id: r.id,
  nickname: r.nickname,
  avatar: r.avatar,
  email: r.email,
  name: r.name,
  createdAt: r.createdAt.toISOString(),
})

const quizOf = (r: QuizRow): Quiz => ({
  id: r.id,
  ownerId: r.ownerId,
  title: r.title,
  coverUrl: r.coverUrl,
  visibility: r.visibility,
  questions: r.questions,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

const resultOf = (r: ResultRow): GameResult => ({
  id: r.id,
  sessionId: r.sessionId,
  quizId: r.quizId,
  quizTitle: r.quizTitle,
  hostId: r.hostId,
  mode: r.mode,
  pin: r.pin,
  startedAt: r.startedAt.toISOString(),
  endedAt: r.endedAt.toISOString(),
  playerCount: r.playerCount,
  averageCorrectPercent: r.averageCorrectPercent,
  hardestQuestionIndex: r.hardestQuestionIndex,
  questions: r.questions,
  players: r.players,
})

const challengeOf = (r: ChallengeRow): ChallengeRecord => ({
  id: r.id,
  code: r.code,
  quizId: r.quizId,
  hostId: r.hostId,
  deadline: r.deadline,
  createdAt: r.createdAt,
})

const attemptOf = (r: AttemptRow): ChallengeAttemptRecord => ({
  id: r.id,
  challengeId: r.challengeId,
  nickname: r.nickname,
  score: r.score,
  currentQuestionIndex: r.currentQuestionIndex,
  finished: r.finished,
  startedAt: r.startedAt,
  questionStartedAt: r.questionStartedAt,
  answers: r.answers,
})

/** Is the string a UUID? Postgres throws on malformed uuid literals, so we short-circuit. */
const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export class PgStore implements Store {
  readonly kind = 'pg' as const
  private readonly db: Db
  private readonly sql: ReturnType<typeof createDb>['sql']

  constructor(databaseUrl: string) {
    const { db, sql } = createDb(databaseUrl)
    this.db = db
    this.sql = sql
  }

  users = {
    findById: async (id: string) => {
      if (!isUuid(id)) return null
      const r = await this.db.query.users.findFirst({ where: eq(t.users.id, id) })
      return r ? userOf(r) : null
    },
    findByEmail: async (email: string) => {
      const r = await this.db.query.users.findFirst({
        where: eq(t.users.email, email.toLowerCase()),
      })
      return r ? userOf(r) : null
    },
    findByGoogleId: async (googleId: string) => {
      const r = await this.db.query.users.findFirst({ where: eq(t.users.googleId, googleId) })
      return r ? userOf(r) : null
    },
    findByNickname: async (nickname: string) => {
      const r = await this.db.query.users.findFirst({
        where: dsql`lower(${t.users.nickname}) = ${nickname.toLowerCase()}`,
      })
      return r ? { user: userOf(r), passwordHash: r.passwordHash } : null
    },
    create: async (input: CreateUserInput) => {
      const [r] = await this.db
        .insert(t.users)
        .values({
          nickname: input.nickname,
          avatar: randomAvatar(),
          email: input.email ? input.email.toLowerCase() : null,
          name: input.name,
          googleId: input.googleId ?? null,
          passwordHash: input.passwordHash ?? null,
        })
        .returning()
      if (!r) throw new Error('insert users returned no row')
      return userOf(r)
    },
    setGoogleId: async (id: string, googleId: string) => {
      await this.db.update(t.users).set({ googleId }).where(eq(t.users.id, id))
    },
    updateAvatar: async (id: string, avatar: string) => {
      const [r] = await this.db
        .update(t.users)
        .set({ avatar })
        .where(eq(t.users.id, id))
        .returning()
      return r ? userOf(r) : null
    },
  }

  magicLinks = {
    create: async (token: string, email: string, expiresAt: Date) => {
      await this.db.insert(t.magicLinks).values({ token, email: email.toLowerCase(), expiresAt })
    },
    consume: async (token: string, now: Date) => {
      const [r] = await this.db
        .update(t.magicLinks)
        .set({ usedAt: now })
        .where(
          and(
            eq(t.magicLinks.token, token),
            isNull(t.magicLinks.usedAt),
            gte(t.magicLinks.expiresAt, now),
          ),
        )
        .returning({ email: t.magicLinks.email })
      return r?.email ?? null
    },
  }

  quizzes = {
    listByOwner: async (ownerId: string) => {
      const rows = await this.db
        .select()
        .from(t.quizzes)
        .where(eq(t.quizzes.ownerId, ownerId))
        .orderBy(desc(t.quizzes.updatedAt))
      return rows.map((r) => toSummary(quizOf(r)))
    },
    get: async (id: string) => {
      if (!isUuid(id)) return null
      const r = await this.db.query.quizzes.findFirst({ where: eq(t.quizzes.id, id) })
      return r ? quizOf(r) : null
    },
    create: async (ownerId: string | null, input: QuizWrite) => {
      const [r] = await this.db
        .insert(t.quizzes)
        .values({
          ownerId,
          title: input.title,
          coverUrl: input.coverUrl ?? null,
          visibility: input.visibility,
          questions: input.questions,
        })
        .returning()
      if (!r) throw new Error('insert quizzes returned no row')
      return quizOf(r)
    },
    update: async (id: string, input: QuizWrite) => {
      if (!isUuid(id)) return null
      const [r] = await this.db
        .update(t.quizzes)
        .set({
          title: input.title,
          coverUrl: input.coverUrl ?? null,
          visibility: input.visibility,
          questions: input.questions,
          updatedAt: new Date(),
        })
        .where(eq(t.quizzes.id, id))
        .returning()
      return r ? quizOf(r) : null
    },
    delete: async (id: string) => {
      if (!isUuid(id)) return false
      const rows = await this.db
        .delete(t.quizzes)
        .where(eq(t.quizzes.id, id))
        .returning({ id: t.quizzes.id })
      return rows.length > 0
    },
    listPublic: async ({ q, page, limit }: LibraryQuery) => {
      const needle = q?.trim()
      const where = needle
        ? and(eq(t.quizzes.visibility, 'public'), ilike(t.quizzes.title, `%${escapeLike(needle)}%`))
        : eq(t.quizzes.visibility, 'public')
      const [rows, [total]] = await Promise.all([
        this.db
          .select({ quiz: t.quizzes, ownerName: t.users.name })
          .from(t.quizzes)
          .leftJoin(t.users, eq(t.users.id, t.quizzes.ownerId))
          .where(where)
          .orderBy(desc(t.quizzes.updatedAt))
          .limit(limit)
          .offset((page - 1) * limit),
        this.db.select({ n: count() }).from(t.quizzes).where(where),
      ])
      return {
        quizzes: rows.map((r) => toSummary(quizOf(r.quiz), r.ownerName)),
        total: total?.n ?? 0,
      }
    },
  }

  gameSessions = {
    create: async (record: GameSessionRecord) => {
      await this.db.insert(t.gameSessions).values(record).onConflictDoNothing()
    },
    update: async (id: string, patch: Partial<GameSessionRecord>) => {
      await this.db.update(t.gameSessions).set(patch).where(eq(t.gameSessions.id, id))
    },
  }

  gameResults = {
    save: async (result: GameResult) => {
      await this.db
        .insert(t.gameResults)
        .values({
          id: result.id,
          sessionId: result.sessionId,
          quizId: result.quizId && isUuid(result.quizId) ? result.quizId : null,
          quizTitle: result.quizTitle,
          hostId: result.hostId,
          mode: result.mode,
          pin: result.pin,
          startedAt: new Date(result.startedAt),
          endedAt: new Date(result.endedAt),
          playerCount: result.playerCount,
          averageCorrectPercent: result.averageCorrectPercent,
          hardestQuestionIndex: result.hardestQuestionIndex,
          questions: result.questions,
          players: result.players,
        })
        .onConflictDoNothing({ target: t.gameResults.sessionId })
    },
    get: async (id: string) => {
      if (!isUuid(id)) return null
      const r = await this.db.query.gameResults.findFirst({ where: eq(t.gameResults.id, id) })
      return r ? resultOf(r) : null
    },
    getBySessionId: async (sessionId: string) => {
      if (!isUuid(sessionId)) return null
      const r = await this.db.query.gameResults.findFirst({
        where: eq(t.gameResults.sessionId, sessionId),
      })
      return r ? resultOf(r) : null
    },
    listByHost: async (hostId: string): Promise<GameResultSummary[]> => {
      const rows = await this.db
        .select({
          id: t.gameResults.id,
          sessionId: t.gameResults.sessionId,
          quizId: t.gameResults.quizId,
          quizTitle: t.gameResults.quizTitle,
          hostId: t.gameResults.hostId,
          mode: t.gameResults.mode,
          pin: t.gameResults.pin,
          startedAt: t.gameResults.startedAt,
          endedAt: t.gameResults.endedAt,
          playerCount: t.gameResults.playerCount,
          averageCorrectPercent: t.gameResults.averageCorrectPercent,
          hardestQuestionIndex: t.gameResults.hardestQuestionIndex,
        })
        .from(t.gameResults)
        .where(eq(t.gameResults.hostId, hostId))
        .orderBy(desc(t.gameResults.endedAt))
      return rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt.toISOString(),
      }))
    },
    delete: async (id: string, hostId: string) => {
      if (!isUuid(id)) return false
      const rows = await this.db
        .delete(t.gameResults)
        .where(and(eq(t.gameResults.id, id), eq(t.gameResults.hostId, hostId)))
        .returning({ id: t.gameResults.id })
      return rows.length > 0
    },
  }

  challenges = {
    create: async (record: ChallengeRecord) => {
      await this.db.insert(t.challenges).values(record)
    },
    getByCode: async (code: string) => {
      const r = await this.db.query.challenges.findFirst({ where: eq(t.challenges.code, code) })
      return r ? challengeOf(r) : null
    },
    getById: async (id: string) => {
      if (!isUuid(id)) return null
      const r = await this.db.query.challenges.findFirst({ where: eq(t.challenges.id, id) })
      return r ? challengeOf(r) : null
    },
    listByHost: async (hostId: string) => {
      const rows = await this.db
        .select()
        .from(t.challenges)
        .where(eq(t.challenges.hostId, hostId))
        .orderBy(desc(t.challenges.createdAt))
      return rows.map(challengeOf)
    },
    countAttempts: async (challengeId: string) => {
      const [r] = await this.db
        .select({ n: count() })
        .from(t.challengeAttempts)
        .where(eq(t.challengeAttempts.challengeId, challengeId))
      return r?.n ?? 0
    },
    createAttempt: async (record: ChallengeAttemptRecord) => {
      await this.db.insert(t.challengeAttempts).values(record)
    },
    getAttempt: async (id: string) => {
      if (!isUuid(id)) return null
      const r = await this.db.query.challengeAttempts.findFirst({
        where: eq(t.challengeAttempts.id, id),
      })
      return r ? attemptOf(r) : null
    },
    updateAttempt: async (record: ChallengeAttemptRecord) => {
      await this.db
        .update(t.challengeAttempts)
        .set({
          score: record.score,
          currentQuestionIndex: record.currentQuestionIndex,
          finished: record.finished,
          questionStartedAt: record.questionStartedAt,
          answers: record.answers,
        })
        .where(eq(t.challengeAttempts.id, record.id))
    },
    listAttempts: async (challengeId: string) => {
      const rows = await this.db
        .select()
        .from(t.challengeAttempts)
        .where(eq(t.challengeAttempts.challengeId, challengeId))
      return rows.map(attemptOf)
    },
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 })
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}
