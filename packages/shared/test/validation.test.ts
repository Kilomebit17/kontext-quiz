import { describe, expect, it } from 'vitest'
import { createGameSchema, questionSchema, quizInputSchema } from '../src/validation'

const good = {
  id: 'q1',
  type: 'single',
  text: 'Q?',
  options: [
    { id: 'a', text: 'A', isCorrect: true },
    { id: 'b', text: 'B', isCorrect: false },
  ],
  timeLimit: 20,
  pointsMultiplier: 1,
}

describe('questionSchema', () => {
  it('accepts a valid single-choice question', () => {
    expect(questionSchema.safeParse(good).success).toBe(true)
  })
  it('rejects two correct answers for single', () => {
    const bad = { ...good, options: good.options.map((o) => ({ ...o, isCorrect: true })) }
    expect(questionSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects text over 120 chars', () => {
    expect(questionSchema.safeParse({ ...good, text: 'x'.repeat(121) }).success).toBe(false)
  })
  it('rejects unsupported time limits', () => {
    expect(questionSchema.safeParse({ ...good, timeLimit: 15 }).success).toBe(false)
  })
  it('rejects non-http media', () => {
    expect(questionSchema.safeParse({ ...good, mediaUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    )
    expect(questionSchema.safeParse({ ...good, mediaUrl: 'https://x.y/z.png' }).success).toBe(true)
  })
  it('accepts info slides with no options', () => {
    expect(questionSchema.safeParse({ ...good, type: 'info', options: [] }).success).toBe(true)
  })
  it('text questions require all options to be correct variants', () => {
    expect(
      questionSchema.safeParse({
        ...good,
        type: 'text',
        options: [{ id: 'a', text: 'kyiv', isCorrect: true }],
      }).success,
    ).toBe(true)
    expect(
      questionSchema.safeParse({
        ...good,
        type: 'text',
        options: [{ id: 'a', text: 'kyiv', isCorrect: false }],
      }).success,
    ).toBe(false)
  })
})

describe('quizInputSchema', () => {
  it('defaults visibility', () => {
    const r = quizInputSchema.parse({ title: 'T', questions: [good] })
    expect(r.visibility).toBe('private')
  })
})

describe('createGameSchema', () => {
  it('requires exactly one of quizId / quiz', () => {
    expect(createGameSchema.safeParse({}).success).toBe(false)
    expect(createGameSchema.safeParse({ quizId: 'x' }).success).toBe(true)
    expect(
      createGameSchema.safeParse({ quizId: 'x', quiz: { title: 'T', questions: [] } }).success,
    ).toBe(false)
  })
})
