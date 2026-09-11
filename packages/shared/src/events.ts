/**
 * Socket.IO event contract. Clients send intents; the server replies with acks
 * and broadcasts `state` snapshots. Nothing else mutates client game state.
 */
import type { GameSnapshot, GameSettings } from './types'

export type ErrorCode =
  | 'INVALID_PIN'
  | 'GAME_NOT_FOUND'
  | 'GAME_ALREADY_STARTED'
  | 'GAME_ENDED'
  | 'NICKNAME_INVALID'
  | 'NICKNAME_PROFANE'
  | 'KICKED'
  | 'RATE_LIMITED'
  | 'INVALID_TOKEN'
  | 'NOT_HOST'
  | 'NOT_IN_QUESTION'
  | 'ALREADY_ANSWERED'
  | 'TOO_LATE'
  | 'TOO_EARLY'
  | 'INVALID_ANSWER'
  | 'INVALID_TRANSITION'
  | 'WRONG_INSTANCE'
  | 'INTERNAL'

export interface ErrorPayload {
  code: ErrorCode
  message?: string
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorPayload }

export interface JoinPayload {
  pin: string
  nickname: string
  /** Team mode: optional preferred team id. */
  teamId?: string | null
  /** Avatar picked on the join screen; a random one is assigned when omitted or unknown. */
  avatar?: string | null
}

export interface JoinResult {
  playerId: string
  /** Opaque player session token — persist in sessionStorage to survive refresh. */
  token: string
  nickname: string
  /** Random animal avatar assigned by the server. */
  avatar: string
  sessionId: string
}

export interface AnswerPayload {
  questionIndex: number
  optionIds?: string[]
  text?: string
}

export interface AnswerAck {
  /** Server-side receipt time (ms). */
  receivedAt: number
}

export interface TimePingResult {
  t0: number
  serverTime: number
}

export interface ClientToServerEvents {
  /** Host attaches to a session created via POST /api/games. */
  'host:join': (
    payload: { hostToken: string },
    ack: (r: Ack<{ snapshot: GameSnapshot }>) => void,
  ) => void
  'host:start': (ack: (r: Ack) => void) => void
  /** Advance from reveal → leaderboard → next question/podium, or skip the timer. */
  'host:next': (ack: (r: Ack) => void) => void
  'host:kick': (payload: { playerId: string }, ack: (r: Ack) => void) => void
  'host:end': (ack: (r: Ack) => void) => void
  /** Close the room immediately: players are dismissed and nothing is archived. */
  'host:cancel': (ack: (r: Ack) => void) => void
  'host:settings': (payload: Partial<GameSettings>, ack: (r: Ack) => void) => void

  'player:join': (payload: JoinPayload, ack: (r: Ack<JoinResult>) => void) => void
  /** Reconnect with a previously issued token. */
  'player:resume': (
    payload: { token: string },
    ack: (r: Ack<{ snapshot: GameSnapshot }>) => void,
  ) => void
  'player:answer': (payload: AnswerPayload, ack: (r: Ack<AnswerAck>) => void) => void
  'player:team': (payload: { teamId: string }, ack: (r: Ack) => void) => void
  'player:leave': () => void

  /** Clock sync: client sends its Date.now(), server echoes with its own. */
  'time:ping': (payload: { t0: number }, ack: (r: TimePingResult) => void) => void
}

export interface ServerToClientEvents {
  /** Full snapshot; players receive `me`, host receives full leaderboard data. */
  state: (snapshot: GameSnapshot) => void
  /** Lightweight tick for the host's "14 of 20 answered" counter. */
  'answer:count': (payload: { answeredCount: number; totalPlayers: number }) => void
  /** The player was removed by the host. */
  kicked: () => void
  /** Non-fatal error. */
  error: (payload: ErrorPayload) => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  role: 'host' | 'player' | null
  sessionId: string | null
  playerId: string | null
}
