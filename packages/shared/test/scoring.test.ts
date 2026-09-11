import { describe, expect, it } from 'vitest'
import { computeScore, evaluateAnswer, normalizeText, rankPlayers } from '../src/scoring'
import type { Question } from '../src/types'

describe('computeScore', () => {
  it('awards 1000 for an instant correct answer', () => {
    const r = computeScore({
      fraction: 1,
      answerTimeMs: 0,
      timeLimitSec: 20,
      multiplier: 1,
      streakBefore: 0,
    })
    expect(r.points).toBe(1000)
    expect(r.streakAfter).toBe(1)
    expect(r.correct).toBe(true)
  })

  it('awards 500 for a correct answer at the deadline', () => {
    const r = computeScore({
      fraction: 1,
      answerTimeMs: 20_000,
      timeLimitSec: 20,
      multiplier: 1,
      streakBefore: 0,
    })
    expect(r.points).toBe(500)
  })

  it('awards 750 at half time', () => {
    const r = computeScore({
      fraction: 1,
      answerTimeMs: 10_000,
      timeLimitSec: 20,
      multiplier: 1,
      streakBefore: 0,
    })
    expect(r.points).toBe(750)
  })

  it('clamps answer time beyond the limit', () => {
    const r = computeScore({
      fraction: 1,
      answerTimeMs: 999_999,
      timeLimitSec: 5,
      multiplier: 1,
      streakBefore: 0,
    })
    expect(r.points).toBe(500)
  })

  it('doubles with ×2 weight and zeroes with ×0', () => {
    expect(
      computeScore({
        fraction: 1,
        answerTimeMs: 0,
        timeLimitSec: 10,
        multiplier: 2,
        streakBefore: 0,
      }).points,
    ).toBe(2000)
    expect(
      computeScore({
        fraction: 1,
        answerTimeMs: 0,
        timeLimitSec: 10,
        multiplier: 0,
        streakBefore: 5,
      }).points,
    ).toBe(0)
  })

  it('gives 0 and resets streak on a wrong answer', () => {
    const r = computeScore({
      fraction: 0,
      answerTimeMs: 100,
      timeLimitSec: 10,
      multiplier: 1,
      streakBefore: 7,
    })
    expect(r.points).toBe(0)
    expect(r.streakAfter).toBe(0)
    expect(r.correct).toBe(false)
  })

  it('applies +100 streak bonus from the 3rd consecutive correct answer', () => {
    const base = { fraction: 1, answerTimeMs: 0, timeLimitSec: 10, multiplier: 1 as const }
    expect(computeScore({ ...base, streakBefore: 0 }).bonusPoints).toBe(0)
    expect(computeScore({ ...base, streakBefore: 1 }).bonusPoints).toBe(0)
    expect(computeScore({ ...base, streakBefore: 2 }).bonusPoints).toBe(100)
    expect(computeScore({ ...base, streakBefore: 2 }).points).toBe(1100)
    expect(computeScore({ ...base, streakBefore: 9 }).points).toBe(1100)
  })

  it('gives proportional points for partial credit', () => {
    const r = computeScore({
      fraction: 0.5,
      answerTimeMs: 0,
      timeLimitSec: 10,
      multiplier: 1,
      streakBefore: 0,
    })
    expect(r.points).toBe(500)
    expect(r.correct).toBe(true)
  })
})

const single: Question = {
  id: 'q1',
  type: 'single',
  text: 'Capital of Ukraine?',
  options: [
    { id: 'a', text: 'Kyiv', isCorrect: true },
    { id: 'b', text: 'Lviv', isCorrect: false },
    { id: 'c', text: 'Odesa', isCorrect: false },
  ],
  timeLimit: 20,
  pointsMultiplier: 1,
}

const multiple: Question = {
  ...single,
  id: 'q2',
  type: 'multiple',
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: true },
    { id: 'c', text: 'C', isCorrect: false },
    { id: 'd', text: 'D', isCorrect: true },
  ],
}

const text: Question = {
  ...single,
  id: 'q3',
  type: 'text',
  options: [
    { id: 'a', text: 'Київ', isCorrect: true },
    { id: 'b', text: 'Kyiv', isCorrect: true },
    { id: 'c', text: 'Kiev', isCorrect: true },
  ],
}

describe('evaluateAnswer', () => {
  it('single: exact option', () => {
    expect(evaluateAnswer(single, { optionIds: ['a'] })).toBe(1)
    expect(evaluateAnswer(single, { optionIds: ['b'] })).toBe(0)
    expect(evaluateAnswer(single, { optionIds: ['a', 'b'] })).toBe(0)
    expect(evaluateAnswer(single, { optionIds: [] })).toBe(0)
    expect(evaluateAnswer(single, {})).toBe(0)
  })

  it('multiple: full match = 1, partial = proportional, any wrong = 0', () => {
    expect(evaluateAnswer(multiple, { optionIds: ['a', 'b', 'd'] })).toBe(1)
    expect(evaluateAnswer(multiple, { optionIds: ['a', 'b'] })).toBeCloseTo(2 / 3)
    expect(evaluateAnswer(multiple, { optionIds: ['a'] })).toBeCloseTo(1 / 3)
    expect(evaluateAnswer(multiple, { optionIds: ['a', 'b', 'c', 'd'] })).toBe(0)
    expect(evaluateAnswer(multiple, { optionIds: ['c'] })).toBe(0)
    expect(evaluateAnswer(multiple, { optionIds: ['zzz'] })).toBe(0)
  })

  it('text: case-insensitive, whitespace-insensitive, any accepted variant', () => {
    expect(evaluateAnswer(text, { text: 'kyiv' })).toBe(1)
    expect(evaluateAnswer(text, { text: '  КИЇВ ' })).toBe(1)
    expect(evaluateAnswer(text, { text: 'Kiev' })).toBe(1)
    expect(evaluateAnswer(text, { text: 'Lviv' })).toBe(0)
    expect(evaluateAnswer(text, { text: '' })).toBe(0)
  })

  it('info slides never score', () => {
    expect(evaluateAnswer({ ...single, type: 'info', options: [] }, { optionIds: ['a'] })).toBe(0)
  })
})

describe('normalizeText', () => {
  it('normalizes quotes and whitespace', () => {
    expect(normalizeText('  Don’t   STOP ')).toBe("don't stop")
  })
})

describe('rankPlayers', () => {
  it('ranks by score with ties sharing a rank', () => {
    const ranked = rankPlayers([
      { nickname: 'b', score: 100 },
      { nickname: 'a', score: 300 },
      { nickname: 'c', score: 100 },
      { nickname: 'd', score: 0 },
    ])
    expect(ranked.map((p) => [p.nickname, p.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ])
  })
})
