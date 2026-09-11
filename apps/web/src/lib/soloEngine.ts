/**
 * Client-side single-player engine. Pure functions over an immutable state so
 * it is trivially testable; timers live in the React layer.
 */
import { computeScore, evaluateAnswer, type Question, type Quiz } from '@kontext/shared'

export type SoloPhase = 'intro' | 'question' | 'reveal' | 'finished'

export interface SoloAnswer {
  questionIndex: number
  fraction: number
  correct: boolean
  points: number
  answerTimeMs: number
  optionIds: string[]
  text: string | null
}

export interface SoloState {
  quizId: string
  title: string
  questions: Question[]
  phase: SoloPhase
  index: number
  score: number
  streak: number
  /** Wall-clock when the current question started (ms). */
  startedAt: number | null
  /** Wall-clock deadline for the current question (ms), null for info slides. */
  deadline: number | null
  answers: SoloAnswer[]
  /** Result of the question just revealed. */
  last: SoloAnswer | null
}

export function createSolo(quiz: Pick<Quiz, 'id' | 'title' | 'questions'>): SoloState {
  return {
    quizId: quiz.id,
    title: quiz.title,
    questions: quiz.questions,
    phase: 'intro',
    index: -1,
    score: 0,
    streak: 0,
    startedAt: null,
    deadline: null,
    answers: [],
    last: null,
  }
}

export function currentQuestion(state: SoloState): Question | null {
  return state.questions[state.index] ?? null
}

/** Move to the next question (or finish). */
export function advance(state: SoloState, now = Date.now()): SoloState {
  const nextIndex = state.index + 1
  if (nextIndex >= state.questions.length) {
    return { ...state, phase: 'finished', startedAt: null, deadline: null, last: null }
  }
  const q = state.questions[nextIndex] as Question
  return {
    ...state,
    phase: 'question',
    index: nextIndex,
    startedAt: now,
    deadline: q.type === 'info' ? null : now + q.timeLimit * 1000,
    last: null,
  }
}

export function start(state: SoloState, now = Date.now()): SoloState {
  return advance({ ...state, index: -1, score: 0, streak: 0, answers: [] }, now)
}

/** Submit an answer (or `null` for time-out / skip). */
export function answer(
  state: SoloState,
  payload: { optionIds?: string[]; text?: string } | null,
  now = Date.now(),
): SoloState {
  if (state.phase !== 'question') return state
  const q = currentQuestion(state)
  if (!q) return state
  if (q.type === 'info') {
    return advance(state, now)
  }
  const answerTimeMs = Math.max(0, now - (state.startedAt ?? now))
  const fraction = payload ? evaluateAnswer(q, payload) : 0
  const score = computeScore({
    fraction,
    answerTimeMs,
    timeLimitSec: q.timeLimit,
    multiplier: q.pointsMultiplier,
    streakBefore: state.streak,
  })
  const record: SoloAnswer = {
    questionIndex: state.index,
    fraction,
    correct: score.correct,
    points: score.points,
    answerTimeMs,
    optionIds: payload?.optionIds ?? [],
    text: payload?.text ?? null,
  }
  return {
    ...state,
    phase: 'reveal',
    score: state.score + score.points,
    streak: score.streakAfter,
    answers: [...state.answers, record],
    last: record,
    deadline: null,
  }
}

export interface SoloSummary {
  score: number
  correct: number
  total: number
  scored: number
}

export function summary(state: SoloState): SoloSummary {
  const scored = state.questions.filter((q) => q.type !== 'info').length
  return {
    score: state.score,
    correct: state.answers.filter((a) => a.correct).length,
    total: state.questions.length,
    scored,
  }
}
