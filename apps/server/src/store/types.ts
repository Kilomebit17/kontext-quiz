import type {
  Challenge,
  GameMode,
  GameResult,
  GameSettings,
  GameStatus,
  Question,
  Quiz,
  QuizInput,
  QuizSummary,
  User,
} from '@kontext/shared'

export interface CreateUserInput {
  nickname: string
  name: string
  email?: string | null
  googleId?: string | null
  passwordHash?: string | null
}

/** User plus the credential needed to verify a password login. */
export interface UserCredentials {
  user: User
  passwordHash: string | null
}

export interface UsersStore {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findByGoogleId(googleId: string): Promise<User | null>
  /** Case-insensitive lookup by handle, with the password hash for verification. */
  findByNickname(nickname: string): Promise<UserCredentials | null>
  create(input: CreateUserInput): Promise<User>
  /** Attach a Google id to an existing user. */
  setGoogleId(id: string, googleId: string): Promise<void>
  /** Change the avatar; returns the updated user or null when the id is unknown. */
  updateAvatar(id: string, avatar: string): Promise<User | null>
}

export interface MagicLinksStore {
  create(token: string, email: string, expiresAt: Date): Promise<void>
  /** Marks the token used and returns its email; null if unknown, expired or already used. */
  consume(token: string, now: Date): Promise<string | null>
}

export interface LibraryQuery {
  q?: string
  page: number
  limit: number
}

/** Validated quiz payload with questions narrowed to the domain type. */
export type QuizWrite = Omit<QuizInput, 'questions'> & { questions: Question[] }

export interface QuizzesStore {
  listByOwner(ownerId: string): Promise<QuizSummary[]>
  get(id: string): Promise<Quiz | null>
  create(ownerId: string | null, input: QuizWrite): Promise<Quiz>
  update(id: string, input: QuizWrite): Promise<Quiz | null>
  delete(id: string): Promise<boolean>
  listPublic(query: LibraryQuery): Promise<{ quizzes: QuizSummary[]; total: number }>
}

export interface GameSessionRecord {
  id: string
  pin: string
  quizId: string | null
  hostId: string | null
  mode: GameMode
  settings: GameSettings
  status: GameStatus
  startedAt: Date | null
  endedAt: Date | null
}

export interface GameSessionsStore {
  create(record: GameSessionRecord): Promise<void>
  update(
    id: string,
    patch: Partial<Pick<GameSessionRecord, 'status' | 'startedAt' | 'endedAt'>>,
  ): Promise<void>
}

export type GameResultSummary = Omit<GameResult, 'players' | 'questions'>

export interface GameResultsStore {
  save(result: GameResult): Promise<void>
  get(id: string): Promise<GameResult | null>
  getBySessionId(sessionId: string): Promise<GameResult | null>
  listByHost(hostId: string): Promise<GameResultSummary[]>
  delete(id: string, hostId: string): Promise<boolean>
}

export interface ChallengeRecord {
  id: string
  code: string
  quizId: string
  hostId: string | null
  deadline: Date
  createdAt: Date
}

export interface ChallengeAttemptAnswer {
  questionIndex: number
  optionIds: string[]
  text: string | null
  correct: boolean
  fraction: number
  points: number
  answerTimeMs: number
  late: boolean
}

export interface ChallengeAttemptRecord {
  id: string
  challengeId: string
  nickname: string
  score: number
  currentQuestionIndex: number
  finished: boolean
  startedAt: Date
  /** questionIndex → server time (ms) the question was first shown. */
  questionStartedAt: Record<string, number>
  answers: ChallengeAttemptAnswer[]
}

export interface ChallengesStore {
  create(record: ChallengeRecord): Promise<void>
  getByCode(code: string): Promise<ChallengeRecord | null>
  getById(id: string): Promise<ChallengeRecord | null>
  listByHost(hostId: string): Promise<ChallengeRecord[]>
  countAttempts(challengeId: string): Promise<number>
  createAttempt(record: ChallengeAttemptRecord): Promise<void>
  getAttempt(id: string): Promise<ChallengeAttemptRecord | null>
  updateAttempt(record: ChallengeAttemptRecord): Promise<void>
  listAttempts(challengeId: string): Promise<ChallengeAttemptRecord[]>
}

export interface Store {
  readonly kind: 'memory' | 'pg'
  users: UsersStore
  magicLinks: MagicLinksStore
  quizzes: QuizzesStore
  gameSessions: GameSessionsStore
  gameResults: GameResultsStore
  challenges: ChallengesStore
  close(): Promise<void>
}

export function toSummary(quiz: Quiz, ownerName?: string | null): QuizSummary {
  return {
    id: quiz.id,
    ownerId: quiz.ownerId,
    ownerName: ownerName ?? null,
    title: quiz.title,
    coverUrl: quiz.coverUrl ?? null,
    visibility: quiz.visibility,
    questionCount: quiz.questions.length,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  }
}

export function toChallenge(
  record: ChallengeRecord,
  quizTitle: string,
  attemptCount: number,
): Challenge {
  return {
    id: record.id,
    code: record.code,
    quizId: record.quizId,
    quizTitle,
    hostId: record.hostId,
    deadline: record.deadline.toISOString(),
    createdAt: record.createdAt.toISOString(),
    attemptCount,
  }
}

export type { Question }
