import type { GameStatus, Question } from './types'

/**
 * lobby → get_ready → question → reveal → leaderboard → (get_ready | podium) → ended
 *
 * Info slides skip scoring: get_ready → question(info) → next goes straight to
 * the following question's get_ready (or podium).
 */
export type GameEvent =
  | { type: 'START' }
  | { type: 'COUNTDOWN_DONE' }
  | { type: 'TIMER_DONE' }
  | { type: 'NEXT' }
  | { type: 'END' }

export interface MachineContext {
  status: GameStatus
  questionIndex: number
  questionCount: number
  /** Type of the current question (needed to skip reveal/leaderboard for info slides). */
  currentQuestionType: Question['type'] | null
  playerCount: number
}

export interface Transition {
  status: GameStatus
  questionIndex: number
}

export class InvalidTransitionError extends Error {
  constructor(from: GameStatus, event: GameEvent['type']) {
    super(`Invalid transition: ${from} + ${event}`)
    this.name = 'InvalidTransitionError'
  }
}

export function canTransition(ctx: MachineContext, event: GameEvent): boolean {
  try {
    transition(ctx, event)
    return true
  } catch {
    return false
  }
}

/** Pure transition function. Throws InvalidTransitionError on illegal moves. */
export function transition(ctx: MachineContext, event: GameEvent): Transition {
  const { status, questionIndex, questionCount } = ctx
  const hasNext = questionIndex + 1 < questionCount

  if (event.type === 'END') {
    if (status === 'ended') throw new InvalidTransitionError(status, event.type)
    return { status: 'ended', questionIndex }
  }

  switch (status) {
    case 'lobby':
      if (event.type === 'START') {
        if (questionCount === 0) throw new InvalidTransitionError(status, event.type)
        return { status: 'get_ready', questionIndex: 0 }
      }
      break

    case 'get_ready':
      if (event.type === 'COUNTDOWN_DONE' || event.type === 'NEXT') {
        return { status: 'question', questionIndex }
      }
      break

    case 'question':
      if (event.type === 'TIMER_DONE' || event.type === 'NEXT') {
        if (ctx.currentQuestionType === 'info') {
          return hasNext
            ? { status: 'get_ready', questionIndex: questionIndex + 1 }
            : { status: 'podium', questionIndex }
        }
        return { status: 'reveal', questionIndex }
      }
      break

    case 'reveal':
      if (event.type === 'NEXT') {
        return { status: 'leaderboard', questionIndex }
      }
      break

    case 'leaderboard':
      if (event.type === 'NEXT') {
        return hasNext
          ? { status: 'get_ready', questionIndex: questionIndex + 1 }
          : { status: 'podium', questionIndex }
      }
      break

    case 'podium':
      if (event.type === 'NEXT') {
        return { status: 'ended', questionIndex }
      }
      break

    case 'ended':
      break
  }
  throw new InvalidTransitionError(status, event.type)
}

export const TERMINAL_STATUSES: readonly GameStatus[] = ['ended']
export const JOINABLE_STATUSES: readonly GameStatus[] = ['lobby']
