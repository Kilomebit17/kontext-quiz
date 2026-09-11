import { sql } from 'drizzle-orm'
import {
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  real,
} from 'drizzle-orm/pg-core'
import type {
  GameMode,
  GameResultPlayer,
  GameResultQuestionStat,
  GameSettings,
  GameStatus,
  Question,
  QuizVisibility,
} from '@kontext/shared'
import type { ChallengeAttemptAnswer } from '../store/types.js'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Unique handle; uniqueness is enforced case-insensitively (see index). */
    nickname: text('nickname').notNull(),
    /** Random animal avatar id, e.g. "fox-2" (see @kontext/shared avatars). */
    avatar: text('avatar').notNull().default('cat-0'),
    /** Null for nickname + password accounts. */
    email: text('email').unique(),
    name: text('name').notNull(),
    googleId: text('google_id').unique(),
    /** scrypt hash; null for magic-link / Google accounts. */
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_nickname_lower_idx').on(sql`lower(${table.nickname})`)],
)

export const magicLinks = pgTable('magic_links', {
  token: text('token').primaryKey(),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    coverUrl: text('cover_url'),
    visibility: text('visibility').$type<QuizVisibility>().notNull().default('private'),
    questions: jsonb('questions').$type<Question[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quizzes_owner_idx').on(t.ownerId),
    index('quizzes_visibility_idx').on(t.visibility),
  ],
)

export const gameSessions = pgTable(
  'game_sessions',
  {
    id: uuid('id').primaryKey(),
    pin: text('pin').notNull(),
    quizId: uuid('quiz_id'),
    hostId: uuid('host_id'),
    mode: text('mode').$type<GameMode>().notNull(),
    settings: jsonb('settings').$type<GameSettings>().notNull(),
    status: text('status').$type<GameStatus>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('game_sessions_host_idx').on(t.hostId)],
)

export const gameResults = pgTable(
  'game_results',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull().unique(),
    quizId: uuid('quiz_id'),
    quizTitle: text('quiz_title').notNull(),
    hostId: uuid('host_id'),
    mode: text('mode').$type<GameMode>().notNull(),
    pin: text('pin').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    playerCount: integer('player_count').notNull(),
    averageCorrectPercent: real('average_correct_percent').notNull(),
    hardestQuestionIndex: integer('hardest_question_index'),
    questions: jsonb('questions').$type<GameResultQuestionStat[]>().notNull(),
    players: jsonb('players').$type<GameResultPlayer[]>().notNull(),
  },
  (t) => [index('game_results_host_idx').on(t.hostId)],
)

export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull().unique(),
    quizId: uuid('quiz_id').notNull(),
    hostId: uuid('host_id'),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('challenges_host_idx').on(t.hostId)],
)

export const challengeAttempts = pgTable(
  'challenge_attempts',
  {
    id: uuid('id').primaryKey(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    score: integer('score').notNull().default(0),
    currentQuestionIndex: integer('current_question_index').notNull().default(0),
    finished: boolean('finished').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    questionStartedAt: jsonb('question_started_at').$type<Record<string, number>>().notNull(),
    answers: jsonb('answers').$type<ChallengeAttemptAnswer[]>().notNull(),
  },
  (t) => [index('challenge_attempts_challenge_idx').on(t.challengeId)],
)
