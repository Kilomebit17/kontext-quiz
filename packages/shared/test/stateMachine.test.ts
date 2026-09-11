import { describe, expect, it } from 'vitest'
import {
  InvalidTransitionError,
  canTransition,
  transition,
  type MachineContext,
} from '../src/stateMachine'

const ctx = (over: Partial<MachineContext> = {}): MachineContext => ({
  status: 'lobby',
  questionIndex: -1,
  questionCount: 3,
  currentQuestionType: 'single',
  playerCount: 2,
  ...over,
})

describe('state machine', () => {
  it('walks the full happy path', () => {
    let s = transition(ctx(), { type: 'START' })
    expect(s).toEqual({ status: 'get_ready', questionIndex: 0 })

    s = transition(ctx(s), { type: 'COUNTDOWN_DONE' })
    expect(s.status).toBe('question')

    s = transition(ctx(s), { type: 'TIMER_DONE' })
    expect(s.status).toBe('reveal')

    s = transition(ctx(s), { type: 'NEXT' })
    expect(s.status).toBe('leaderboard')

    s = transition(ctx(s), { type: 'NEXT' })
    expect(s).toEqual({ status: 'get_ready', questionIndex: 1 })

    // question 2
    s = transition(ctx(s), { type: 'COUNTDOWN_DONE' })
    s = transition(ctx(s), { type: 'NEXT' }) // host skips timer
    expect(s.status).toBe('reveal')
    s = transition(ctx(s), { type: 'NEXT' })
    s = transition(ctx(s), { type: 'NEXT' })
    expect(s).toEqual({ status: 'get_ready', questionIndex: 2 })

    // last question
    s = transition(ctx(s), { type: 'COUNTDOWN_DONE' })
    s = transition(ctx(s), { type: 'TIMER_DONE' })
    s = transition(ctx(s), { type: 'NEXT' })
    s = transition(ctx(s), { type: 'NEXT' })
    expect(s).toEqual({ status: 'podium', questionIndex: 2 })

    s = transition(ctx(s), { type: 'NEXT' })
    expect(s.status).toBe('ended')
  })

  it('rejects starting with zero questions', () => {
    expect(() => transition(ctx({ questionCount: 0 }), { type: 'START' })).toThrow(
      InvalidTransitionError,
    )
  })

  it('rejects illegal moves', () => {
    expect(canTransition(ctx(), { type: 'NEXT' })).toBe(false)
    expect(canTransition(ctx({ status: 'reveal' }), { type: 'TIMER_DONE' })).toBe(false)
    expect(canTransition(ctx({ status: 'ended' }), { type: 'NEXT' })).toBe(false)
    expect(canTransition(ctx({ status: 'ended' }), { type: 'END' })).toBe(false)
    expect(canTransition(ctx({ status: 'question' }), { type: 'START' })).toBe(false)
  })

  it('END works from any non-terminal state', () => {
    for (const status of [
      'lobby',
      'get_ready',
      'question',
      'reveal',
      'leaderboard',
      'podium',
    ] as const) {
      expect(transition(ctx({ status }), { type: 'END' }).status).toBe('ended')
    }
  })

  it('info slides skip reveal and leaderboard', () => {
    const s = transition(
      ctx({ status: 'question', questionIndex: 0, currentQuestionType: 'info' }),
      { type: 'NEXT' },
    )
    expect(s).toEqual({ status: 'get_ready', questionIndex: 1 })

    const last = transition(
      ctx({ status: 'question', questionIndex: 2, currentQuestionType: 'info' }),
      { type: 'TIMER_DONE' },
    )
    expect(last).toEqual({ status: 'podium', questionIndex: 2 })
  })
})
