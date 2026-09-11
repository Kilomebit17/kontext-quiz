import { create } from 'zustand'
import type {
  AnswerAck,
  AnswerPayload,
  ErrorPayload,
  GameSettings,
  GameSnapshot,
} from '@kontext/shared'
import { connect, disconnect, emitWithAck, getSocket, SocketError, syncClock } from '@/lib/socket'
import { getClockOffset, onClockOffset } from '@/lib/clock'
import {
  hostSessionKey,
  PLAYER_SESSION_KEY,
  readJson,
  removeKey,
  writeJson,
  type StoredPlayerSession,
} from '@/lib/storage'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting'
export type Role = 'player' | 'host' | null

export interface LiveCount {
  answeredCount: number
  totalPlayers: number
}

interface GameState {
  snapshot: GameSnapshot | null
  clockOffset: number
  connection: ConnectionState
  role: Role
  playerToken: string | null
  hostToken: string | null
  sessionId: string | null
  nickname: string | null
  lastError: ErrorPayload | null
  answeredThisQuestion: boolean
  kicked: boolean
  resumeFailed: boolean
  /** Changes on every phase change — drives the aria-live announcer. */
  phaseKey: string
  liveCount: LiveCount | null

  joinAsPlayer: (
    pin: string,
    nickname: string,
    teamId?: string | null,
    avatar?: string | null,
  ) => Promise<void>
  resumePlayer: () => Promise<boolean>
  joinAsHost: (sessionId: string) => Promise<boolean>
  answer: (payload: Omit<AnswerPayload, 'questionIndex'>) => Promise<AnswerAck>
  switchTeam: (teamId: string) => Promise<void>
  hostStart: () => Promise<void>
  hostNext: () => Promise<void>
  hostKick: (playerId: string) => Promise<void>
  hostEnd: () => Promise<void>
  /** Close the room: players are dismissed, nothing is archived. Resolves true on success. */
  hostCancel: () => Promise<boolean>
  hostUpdateSettings: (settings: Partial<GameSettings>) => Promise<void>
  leave: () => void
  clearError: () => void
  hasStoredPlayerSession: () => boolean
}

let bound = false
let intentionalDisconnect = false

function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof SocketError) return { code: err.code, message: err.message }
  return { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) }
}

export const useGameStore = create<GameState>()((set, get) => {
  const applySnapshot = (snapshot: GameSnapshot) => {
    const prev = get().snapshot
    const phaseChanged =
      !prev || prev.status !== snapshot.status || prev.questionIndex !== snapshot.questionIndex
    const answered =
      snapshot.me?.hasAnswered ??
      (phaseChanged && snapshot.status !== 'question' ? false : get().answeredThisQuestion)
    set({
      snapshot,
      phaseKey: `${snapshot.status}:${snapshot.questionIndex}`,
      answeredThisQuestion: phaseChanged ? Boolean(snapshot.me?.hasAnswered) : answered,
      liveCount:
        snapshot.status === 'question'
          ? { answeredCount: snapshot.answeredCount, totalPlayers: snapshot.players.length }
          : null,
      sessionId: snapshot.sessionId,
    })
  }

  const bindSocket = () => {
    if (bound) return
    bound = true
    const s = getSocket()
    s.on('connect', () => {
      set({ connection: 'connected' })
      void syncClock()
      const { role, playerToken, sessionId } = get()
      if (role === 'player' && playerToken) void get().resumePlayer()
      else if (role === 'host' && sessionId) void get().joinAsHost(sessionId)
    })
    s.on('disconnect', () => {
      set({ connection: intentionalDisconnect ? 'idle' : 'reconnecting' })
      intentionalDisconnect = false
    })
    s.io.on('reconnect_attempt', () => set({ connection: 'reconnecting' }))
    s.on('state', applySnapshot)
    s.on('answer:count', (payload) => set({ liveCount: payload }))
    s.on('kicked', () => {
      removeKey('session', PLAYER_SESSION_KEY)
      set({ kicked: true, role: null, playerToken: null, snapshot: null })
      intentionalDisconnect = true
      disconnect()
    })
    s.on('error', (payload) => set({ lastError: payload }))
    onClockOffset((clockOffset) => set({ clockOffset }))
  }

  const ensureConnected = () => {
    bindSocket()
    if (get().connection === 'idle') set({ connection: 'connecting' })
    connect()
  }

  return {
    snapshot: null,
    clockOffset: getClockOffset(),
    connection: 'idle',
    role: null,
    playerToken: null,
    hostToken: null,
    sessionId: null,
    nickname: null,
    lastError: null,
    answeredThisQuestion: false,
    kicked: false,
    resumeFailed: false,
    phaseKey: '',
    liveCount: null,

    hasStoredPlayerSession: () =>
      readJson<StoredPlayerSession>('session', PLAYER_SESSION_KEY) !== null,

    joinAsPlayer: async (pin, nickname, teamId, avatar) => {
      ensureConnected()
      set({ kicked: false, resumeFailed: false, lastError: null })
      const r = await emitWithAck('player:join', {
        pin,
        nickname,
        teamId: teamId ?? null,
        avatar: avatar ?? null,
      })
      const stored: StoredPlayerSession = {
        token: r.token,
        sessionId: r.sessionId,
        nickname: r.nickname,
      }
      writeJson('session', PLAYER_SESSION_KEY, stored)
      set({
        role: 'player',
        playerToken: r.token,
        sessionId: r.sessionId,
        nickname: r.nickname,
        answeredThisQuestion: false,
      })
    },

    resumePlayer: async () => {
      const stored = readJson<StoredPlayerSession>('session', PLAYER_SESSION_KEY)
      const token = get().playerToken ?? stored?.token
      if (!token) return false
      ensureConnected()
      set({ role: 'player', playerToken: token, nickname: stored?.nickname ?? get().nickname })
      try {
        const r = await emitWithAck('player:resume', { token })
        applySnapshot(r.snapshot)
        set({ resumeFailed: false })
        return true
      } catch (err) {
        const payload = toErrorPayload(err)
        if (payload.code === 'KICKED') {
          removeKey('session', PLAYER_SESSION_KEY)
          set({ kicked: true, role: null, playerToken: null })
        } else if (payload.code !== 'INTERNAL') {
          // Token rejected (game ended / invalid) — forget it.
          removeKey('session', PLAYER_SESSION_KEY)
          set({ resumeFailed: true, lastError: payload, role: null, playerToken: null })
        } else {
          set({ lastError: payload })
        }
        return false
      }
    },

    joinAsHost: async (sessionId) => {
      const stored = readJson<{ hostToken: string }>('session', hostSessionKey(sessionId))
      const hostToken =
        stored?.hostToken ?? (get().sessionId === sessionId ? get().hostToken : null)
      if (!hostToken) return false
      ensureConnected()
      set({ role: 'host', hostToken, sessionId })
      try {
        const r = await emitWithAck('host:join', { hostToken })
        applySnapshot(r.snapshot)
        return true
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
        return false
      }
    },

    answer: async (payload) => {
      const snap = get().snapshot
      if (!snap || snap.status !== 'question') {
        throw new SocketError({ code: 'NOT_IN_QUESTION' })
      }
      try {
        const r = await emitWithAck('player:answer', {
          questionIndex: snap.questionIndex,
          ...payload,
        })
        set({ answeredThisQuestion: true })
        return { receivedAt: r.receivedAt }
      } catch (err) {
        const p = toErrorPayload(err)
        if (p.code === 'ALREADY_ANSWERED') set({ answeredThisQuestion: true })
        set({ lastError: p })
        throw err
      }
    },

    switchTeam: async (teamId) => {
      try {
        await emitWithAck('player:team', { teamId })
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },

    hostStart: async () => {
      try {
        await emitWithAck('host:start')
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },
    hostNext: async () => {
      try {
        await emitWithAck('host:next')
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },
    hostKick: async (playerId) => {
      try {
        await emitWithAck('host:kick', { playerId })
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },
    hostEnd: async () => {
      try {
        await emitWithAck('host:end')
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },
    hostCancel: async () => {
      try {
        await emitWithAck('host:cancel')
        return true
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
        return false
      }
    },
    hostUpdateSettings: async (settings) => {
      try {
        await emitWithAck('host:settings', settings)
      } catch (err) {
        set({ lastError: toErrorPayload(err) })
      }
    },

    leave: () => {
      if (get().role === 'player') {
        try {
          getSocket().emit('player:leave')
        } catch {
          // ignore
        }
        removeKey('session', PLAYER_SESSION_KEY)
      }
      intentionalDisconnect = true
      disconnect()
      set({
        snapshot: null,
        role: null,
        playerToken: null,
        hostToken: null,
        sessionId: null,
        nickname: null,
        answeredThisQuestion: false,
        kicked: false,
        resumeFailed: false,
        phaseKey: '',
        liveCount: null,
        connection: 'idle',
      })
    },

    clearError: () => set({ lastError: null }),
  }
})

export interface StoredHostSession {
  hostToken: string
  joinUrl?: string
}

/** Persist the host token for a freshly created game (called from the dashboard). */
export function storeHostToken(sessionId: string, hostToken: string, joinUrl?: string): void {
  writeJson('session', hostSessionKey(sessionId), {
    hostToken,
    joinUrl,
  } satisfies StoredHostSession)
}

export function readHostSession(sessionId: string): StoredHostSession | null {
  return readJson<StoredHostSession>('session', hostSessionKey(sessionId))
}
