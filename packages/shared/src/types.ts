/**
 * Core domain types shared between server and web.
 * The server is the single source of truth; clients only send intents
 * and render snapshots.
 */

export type QuestionType = 'single' | 'multiple' | 'truefalse' | 'text' | 'info'

export const TIME_LIMITS = [5, 10, 20, 30, 60, 90, 120] as const
export type TimeLimit = (typeof TIME_LIMITS)[number]

export const POINTS_MULTIPLIERS = [0, 1, 2] as const
export type PointsMultiplier = (typeof POINTS_MULTIPLIERS)[number]

export const MAX_QUESTION_TEXT = 120
export const MAX_OPTION_TEXT = 75
export const MAX_NICKNAME = 20
export const MAX_QUIZ_TITLE = 80

export interface QuizOption {
  id: string
  text: string
  isCorrect: boolean
}

export interface Question {
  id: string
  type: QuestionType
  /** Up to 120 characters. */
  text: string
  /** Image URL or YouTube URL. */
  mediaUrl?: string | null
  /**
   * - single / multiple: 2–4 options
   * - truefalse: exactly 2 options ("true", "false"), one correct
   * - text: accepted spelling variants (every option isCorrect=true)
   * - info: empty
   */
  options: QuizOption[]
  timeLimit: TimeLimit
  pointsMultiplier: PointsMultiplier
}

export type QuizVisibility = 'private' | 'public' | 'link'

export interface Quiz {
  id: string
  ownerId: string | null
  title: string
  coverUrl?: string | null
  visibility: QuizVisibility
  questions: Question[]
  createdAt: string
  updatedAt: string
}

/** Quiz metadata without questions — for lists. */
export interface QuizSummary {
  id: string
  ownerId: string | null
  ownerName?: string | null
  title: string
  coverUrl?: string | null
  visibility: QuizVisibility
  questionCount: number
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  /** Unique handle (shown as @nickname). */
  nickname: string
  /** Random animal avatar assigned at sign-up, never changed. See avatars.ts. */
  avatar: string
  name: string
  /** Null for accounts created with nickname + password. */
  email: string | null
  createdAt: string
}

export const MIN_PASSWORD = 6
export const MAX_PASSWORD = 128

// ---------------------------------------------------------------------------
// Game session
// ---------------------------------------------------------------------------

export type GameMode = 'live' | 'team' | 'challenge' | 'solo'

export type GameStatus =
  'lobby' | 'get_ready' | 'question' | 'reveal' | 'leaderboard' | 'podium' | 'ended'

export interface GameSettings {
  mode: GameMode
  shuffleQuestions: boolean
  shuffleOptions: boolean
  /** Mirror the question text on the player's phone. */
  showQuestionOnPlayer: boolean
  /** Team mode only: players per team (2–5). */
  teamSize: number
  /** End the question as soon as every connected player has answered. */
  endWhenAllAnswered: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mode: 'live',
  shuffleQuestions: false,
  shuffleOptions: false,
  showQuestionOnPlayer: true,
  teamSize: 3,
  endWhenAllAnswered: true,
}

/** Countdown before each question, ms. */
export const GET_READY_MS = 3000
/** Team-mode discussion window, ms. */
export const DISCUSSION_MS = 5000
/** Answers arriving up to this long after the deadline are still accepted. */
export const GRACE_MS = 500
/** Auto-advance from reveal to leaderboard? No — host controls. Kept for reference. */

export interface PlayerPublic {
  id: string
  nickname: string
  /** Random animal avatar assigned on join (see avatars.ts). */
  avatar: string
  score: number
  streak: number
  connected: boolean
  teamId?: string | null
}

export interface Team {
  id: string
  name: string
  memberIds: string[]
  /** Average of member scores, rounded. */
  score: number
}

/** Option as shown to players: no correctness. */
export interface PublicOption {
  id: string
  text: string
  /** 0..3 — picks the color + shape on clients. */
  index: number
}

export interface PublicQuestion {
  id: string
  index: number
  total: number
  type: QuestionType
  /** Omitted for players when settings.showQuestionOnPlayer is false. */
  text: string | null
  mediaUrl?: string | null
  options: PublicOption[]
  timeLimit: TimeLimit
  pointsMultiplier: PointsMultiplier
}

export interface OptionDistribution {
  optionId: string
  count: number
}

export interface RevealData {
  correctOptionIds: string[]
  /** For text questions: accepted answers. */
  acceptedAnswers: string[]
  distribution: OptionDistribution[]
  /** Text questions: bucketed free-text answers. */
  textDistribution: { text: string; count: number; correct: boolean }[]
  answeredCount: number
  correctCount: number
  totalPlayers: number
}

export interface LeaderboardEntry {
  playerId: string
  nickname: string
  /** Null for team entries. */
  avatar: string | null
  score: number
  streak: number
  rank: number
  /** Previous rank before this question (for FLIP animations). */
  previousRank: number | null
  teamId?: string | null
}

export interface AnswerResult {
  questionIndex: number
  /** False when the player never answered (timed out). */
  answered: boolean
  correct: boolean
  /** 0..1 for partial credit on multiple-choice. */
  fraction: number
  points: number
  streak: number
  score: number
  rank: number
  answerTimeMs: number
}

export interface MePlayer {
  id: string
  nickname: string
  avatar: string
  score: number
  streak: number
  rank: number
  hasAnswered: boolean
  /** Result of the most recently revealed question. */
  lastResult: AnswerResult | null
  teamId?: string | null
}

export interface GameSnapshot {
  sessionId: string
  pin: string
  quizTitle: string
  status: GameStatus
  settings: GameSettings
  /** Index of the current question, -1 in lobby. */
  questionIndex: number
  questionCount: number
  /** Server wall-clock at the time the snapshot was produced (ms). */
  serverTime: number
  /**
   * Question phase: answers are due at this server time (ms).
   * get_ready phase: when the 3-2-1 countdown ends. Null otherwise (and for info slides).
   */
  deadline: number | null
  /** Question phase: when the question was shown (ms). */
  questionStartedAt: number | null
  /** Team mode: buttons unlock at this server time (ms). */
  discussionUntil: number | null
  players: PlayerPublic[]
  teams: Team[]
  question: PublicQuestion | null
  reveal: RevealData | null
  leaderboard: LeaderboardEntry[]
  /** Full ranking — only in podium/ended for host. */
  finalRanking: LeaderboardEntry[] | null
  /** Live answer count during question phase. */
  answeredCount: number
  /**
   * Why the game reached `ended` (null before that): played to the end,
   * cancelled by the host (room closed, nothing archived) or host absent too long.
   */
  endReason: EndReason | null
  /** Present only in player-scoped snapshots. */
  me?: MePlayer
}

export type EndReason = 'completed' | 'cancelled' | 'host_left'

/** Archived game for history & CSV export. */
export interface GameResultPlayer {
  playerId: string
  nickname: string
  avatar?: string | null
  score: number
  rank: number
  correctCount: number
  answers: {
    questionIndex: number
    correct: boolean
    points: number
    answerTimeMs: number | null
    optionIds: string[]
    textAnswer: string | null
  }[]
}

export interface GameResultQuestionStat {
  questionIndex: number
  text: string
  type: QuestionType
  correctPercent: number
  averageTimeMs: number
}

export interface GameResult {
  id: string
  sessionId: string
  quizId: string | null
  quizTitle: string
  hostId: string | null
  mode: GameMode
  pin: string
  startedAt: string
  endedAt: string
  playerCount: number
  averageCorrectPercent: number
  hardestQuestionIndex: number | null
  questions: GameResultQuestionStat[]
  players: GameResultPlayer[]
}

// ---------------------------------------------------------------------------
// Challenge (asynchronous) mode
// ---------------------------------------------------------------------------

export interface Challenge {
  id: string
  code: string
  quizId: string
  quizTitle: string
  hostId: string | null
  deadline: string
  createdAt: string
  attemptCount: number
}

export interface ChallengeAttempt {
  id: string
  challengeId: string
  nickname: string
  score: number
  currentQuestionIndex: number
  finished: boolean
  startedAt: string
}
