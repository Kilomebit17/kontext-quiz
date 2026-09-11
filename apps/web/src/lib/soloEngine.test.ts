import { describe, expect, it } from 'vitest'
import type { Question } from '@kontext/shared'
import { advance, answer, createSolo, currentQuestion, start, summary } from './soloEngine'

const questions: Question[] = [
  {
    id: 'q1',
    type: 'single',
    text: 'Capital of Ukraine?',
    options: [
      { id: 'a', text: 'Kyiv', isCorrect: true },
      { id: 'b', text: 'Lviv', isCorrect: false },
    ],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'q2',
    type: 'info',
    text: 'Fun fact',
    options: [],
    timeLimit: 20,
    pointsMultiplier: 1,
  },
  {
    id: 'q3',
    type: 'text',
    text: 'Type "hello"',
    options: [{ id: 'c', text: 'Hello', isCorrect: true }],
    timeLimit: 10,
    pointsMultiplier: 2,
  },
]

describe('soloEngine', () => {
  it('starts on the first question with a deadline', () => {
    const s = start(createSolo({ id: 'quiz', title: 'T', questions }), 1000)
    expect(s.phase).toBe('question')
    expect(s.index).toBe(0)
    expect(s.startedAt).toBe(1000)
    expect(s.deadline).toBe(21000)
  })

  it('scores a correct answer with speed bonus and reveals', () => {
    let s = start(createSolo({ id: 'quiz', title: 'T', questions }), 1000)
    s = answer(s, { optionIds: ['a'] }, 1000 + 5000) // 5s of 20 → factor 0.875
    expect(s.phase).toBe('reveal')
    expect(s.last?.correct).toBe(true)
    expect(s.last?.points).toBe(875)
    expect(s.score).toBe(875)
    expect(s.streak).toBe(1)
  })

  it('scores a wrong answer as 0 and resets streak', () => {
    let s = start(createSolo({ id: 'quiz', title: 'T', questions }), 0)
    s = { ...s, streak: 4 }
    s = answer(s, { optionIds: ['b'] }, 1000)
    expect(s.last?.points).toBe(0)
    expect(s.streak).toBe(0)
  })

  it('treats null as a timeout', () => {
    let s = start(createSolo({ id: 'quiz', title: 'T', questions }), 0)
    s = answer(s, null, 20000)
    expect(s.phase).toBe('reveal')
    expect(s.last?.correct).toBe(false)
  })

  it('skips info slides without scoring and finishes at the end', () => {
    let s = start(createSolo({ id: 'quiz', title: 'T', questions }), 0)
    s = answer(s, { optionIds: ['a'] }, 100)
    s = advance(s, 200)
    expect(currentQuestion(s)?.type).toBe('info')
    expect(s.deadline).toBeNull()
    s = answer(s, null, 300) // "next" on an info slide
    expect(s.index).toBe(2)
    expect(s.phase).toBe('question')
    s = answer(s, { text: '  hello ' }, 300 + 2000) // 2s of 10 → 0.9 × 2 × 1000
    expect(s.last?.points).toBe(1800)
    s = advance(s, 5000)
    expect(s.phase).toBe('finished')
    const sum = summary(s)
    expect(sum.correct).toBe(2)
    expect(sum.total).toBe(3)
    expect(sum.scored).toBe(2)
    expect(sum.score).toBe(s.score)
  })

  it('ignores answers outside the question phase', () => {
    const s = createSolo({ id: 'quiz', title: 'T', questions })
    expect(answer(s, { optionIds: ['a'] })).toBe(s)
  })
})
