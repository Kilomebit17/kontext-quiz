import type { PointsMultiplier, Question } from './types'

export const BASE_POINTS = 1000
export const STREAK_BONUS = 100
/** Streak length at which the bonus starts applying (inclusive). */
export const STREAK_THRESHOLD = 3

export interface ScoreInput {
  /** 0..1 — 1 for a fully correct answer, 0 for wrong / missing. */
  fraction: number
  /** Milliseconds between question start and answer receipt. */
  answerTimeMs: number
  /** Question time limit in seconds. */
  timeLimitSec: number
  multiplier: PointsMultiplier
  /** Consecutive correct answers *before* this question. */
  streakBefore: number
}

export interface ScoreOutput {
  points: number
  basePoints: number
  bonusPoints: number
  streakAfter: number
  correct: boolean
}

/**
 * points = round(1000 × weight × (1 − (t / T) / 2)) × fraction
 * Correct answer: 500..1000 (×weight). Wrong or none: 0.
 * Streak: once a player has 3+ correct in a row, every question in that streak
 * from the 3rd onward earns +100 bonus. A wrong/partial-with-error answer resets it.
 */
export function computeScore(input: ScoreInput): ScoreOutput {
  const { fraction, multiplier, streakBefore } = input
  const timeLimitMs = Math.max(1, input.timeLimitSec) * 1000
  const t = Math.min(Math.max(0, input.answerTimeMs), timeLimitMs)
  const correct = fraction > 0

  if (!correct) {
    return { points: 0, basePoints: 0, bonusPoints: 0, streakAfter: 0, correct: false }
  }

  const speedFactor = 1 - t / timeLimitMs / 2
  const basePoints = Math.round(BASE_POINTS * multiplier * speedFactor * fraction)
  const streakAfter = streakBefore + 1
  const bonusPoints = multiplier > 0 && streakAfter >= STREAK_THRESHOLD ? STREAK_BONUS : 0

  return {
    points: basePoints + bonusPoints,
    basePoints,
    bonusPoints,
    streakAfter,
    correct: true,
  }
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Evaluate a submitted answer against a question.
 * Returns the correctness fraction (0..1).
 * - single / truefalse: 1 if the single selected option is correct.
 * - multiple: selectedCorrect / totalCorrect, but 0 if any incorrect option was selected.
 * - text: 1 if the normalized text matches any accepted variant.
 * - info: always 0 (not scored).
 */
export function evaluateAnswer(
  question: Question,
  answer: { optionIds?: string[]; text?: string },
): number {
  switch (question.type) {
    case 'single':
    case 'truefalse': {
      const ids = answer.optionIds ?? []
      if (ids.length !== 1) return 0
      const opt = question.options.find((o) => o.id === ids[0])
      return opt?.isCorrect ? 1 : 0
    }
    case 'multiple': {
      const ids = new Set(answer.optionIds ?? [])
      if (ids.size === 0) return 0
      const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id)
      if (correctIds.length === 0) return 0
      for (const id of ids) {
        const opt = question.options.find((o) => o.id === id)
        if (!opt) return 0
        if (!opt.isCorrect) return 0
      }
      const hit = correctIds.filter((id) => ids.has(id)).length
      return hit / correctIds.length
    }
    case 'text': {
      const given = normalizeText(answer.text ?? '')
      if (!given) return 0
      return question.options.some((o) => o.isCorrect && normalizeText(o.text) === given) ? 1 : 0
    }
    case 'info':
      return 0
  }
}

/** Rank players by score (desc), ties broken by nickname for stability. */
export function rankPlayers<T extends { score: number; nickname: string }>(
  players: T[],
): (T & { rank: number })[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
  )
  let rank = 0
  let lastScore: number | null = null
  return sorted.map((p, i) => {
    if (p.score !== lastScore) {
      rank = i + 1
      lastScore = p.score
    }
    return { ...p, rank }
  })
}
