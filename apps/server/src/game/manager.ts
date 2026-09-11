import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import {
  DEFAULT_GAME_SETTINGS,
  generatePin,
  shuffle,
  type GameSettings,
  type Question,
} from '@kontext/shared'
import { GameRoom, type ChangeReason } from './room.js'

export const OWNER_TTL_SEC = 6 * 3600
/** How long an ended room stays in memory. */
export const ENDED_RETENTION_MS = 10 * 60_000
/** How long a room waits for the host to come back before ending. */
export const HOST_GRACE_MS = 10 * 60_000

export interface RoomMeta {
  status: string
  quizTitle: string
  mode: string
}

export interface RoomManagerOptions {
  instanceId: string
  redis?: Redis | null
  logger: FastifyBaseLogger
  now?: () => number
}

export interface CreateRoomInput {
  quiz: { id: string | null; title: string; questions: Question[] }
  settings: Partial<GameSettings> | undefined
  hostId: string | null
}

type ChangeListener = (room: GameRoom, reason: ChangeReason) => void
type CountListener = (room: GameRoom, answeredCount: number, totalPlayers: number) => void
type EndedListener = (room: GameRoom) => void

/**
 * Owns the GameRooms living on this instance. Records ownership in Redis so
 * other instances can forward intents, evicts ended rooms and handles the
 * host-disconnect grace period.
 */
export class RoomManager {
  readonly instanceId: string
  private readonly rooms = new Map<string, GameRoom>()
  private readonly byPin = new Map<string, string>()
  private readonly redis: Redis | null
  private readonly log: FastifyBaseLogger
  private readonly now: () => number
  private readonly hostTimers = new Map<string, NodeJS.Timeout>()
  private readonly evictTimers = new Map<string, NodeJS.Timeout>()
  private refreshTimer: NodeJS.Timeout | null = null

  private changeListeners: ChangeListener[] = []
  private countListeners: CountListener[] = []
  private endedListeners: EndedListener[] = []

  constructor(opts: RoomManagerOptions) {
    this.instanceId = opts.instanceId
    this.redis = opts.redis ?? null
    this.log = opts.logger
    this.now = opts.now ?? Date.now
    if (this.redis) {
      this.refreshTimer = setInterval(() => void this.refreshOwnership(), 30 * 60_000)
      this.refreshTimer.unref()
    }
  }

  onChange(fn: ChangeListener): void {
    this.changeListeners.push(fn)
  }
  onAnswerCount(fn: CountListener): void {
    this.countListeners.push(fn)
  }
  onEnded(fn: EndedListener): void {
    this.endedListeners.push(fn)
  }

  get size(): number {
    return this.rooms.size
  }

  get activePlayers(): number {
    let n = 0
    for (const r of this.rooms.values()) if (r.status !== 'ended') n += r.connectedPlayerCount
    return n
  }

  all(): IterableIterator<GameRoom> {
    return this.rooms.values()
  }

  get(sessionId: string): GameRoom | undefined {
    return this.rooms.get(sessionId)
  }

  getByPin(pin: string): GameRoom | undefined {
    const id = this.byPin.get(pin)
    return id ? this.rooms.get(id) : undefined
  }

  async create(input: CreateRoomInput): Promise<GameRoom> {
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(input.settings ?? {}) }
    let questions = input.quiz.questions.map((q) => ({ ...q, options: [...q.options] }))
    if (settings.shuffleQuestions) questions = shuffle(questions)
    if (settings.shuffleOptions) {
      questions = questions.map((q) =>
        q.type === 'single' || q.type === 'multiple' ? { ...q, options: shuffle(q.options) } : q,
      )
    }
    const sessionId = randomUUID()
    const pin = await this.allocatePin(sessionId)
    const room = new GameRoom({
      sessionId,
      pin,
      quiz: { id: input.quiz.id, title: input.quiz.title, questions },
      settings,
      hostId: input.hostId,
      now: this.now,
      schedule: (fn, ms) => {
        const t = setTimeout(fn, Math.max(0, ms))
        return () => clearTimeout(t)
      },
      onChange: (r, reason) => this.handleChange(r, reason),
      onAnswerCount: (r, a, t) => {
        for (const l of this.countListeners) l(r, a, t)
      },
    })
    this.rooms.set(sessionId, room)
    this.byPin.set(pin, sessionId)
    if (this.redis) {
      await this.redis
        .multi()
        .set(`kq:owner:${sessionId}`, this.instanceId, 'EX', OWNER_TTL_SEC)
        .set(`kq:meta:${sessionId}`, JSON.stringify(this.meta(room)), 'EX', OWNER_TTL_SEC)
        .exec()
    }
    // Host has not connected yet: start the grace timer right away.
    this.hostDisconnected(sessionId)
    this.log.info({ sessionId, pin }, 'room created')
    return room
  }

  private async allocatePin(sessionId: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin()
      if (this.byPin.has(pin)) continue
      if (this.redis) {
        const ok = await this.redis.set(`kq:pin:${pin}`, sessionId, 'EX', OWNER_TTL_SEC, 'NX')
        if (ok !== 'OK') continue
      }
      return pin
    }
    throw new Error('Could not allocate a unique PIN')
  }

  private meta(room: GameRoom): RoomMeta {
    return { status: room.status, quizTitle: room.quizTitle, mode: room.settings.mode }
  }

  /** Where does this session live? Returns null when unknown. */
  async ownerOf(sessionId: string): Promise<string | null> {
    if (this.rooms.has(sessionId)) return this.instanceId
    if (!this.redis) return null
    return this.redis.get(`kq:owner:${sessionId}`)
  }

  async sessionIdForPin(pin: string): Promise<string | null> {
    const local = this.byPin.get(pin)
    if (local) return local
    if (!this.redis) return null
    return this.redis.get(`kq:pin:${pin}`)
  }

  async remoteMeta(sessionId: string): Promise<RoomMeta | null> {
    if (!this.redis) return null
    const raw = await this.redis.get(`kq:meta:${sessionId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as RoomMeta
    } catch {
      return null
    }
  }

  private handleChange(room: GameRoom, reason: ChangeReason): void {
    if (reason === 'phase') {
      if (this.redis) {
        void this.redis
          .set(`kq:meta:${room.sessionId}`, JSON.stringify(this.meta(room)), 'EX', OWNER_TTL_SEC)
          .catch((e) => this.log.warn({ err: e }, 'redis meta update failed'))
      }
      if (room.status === 'ended') this.handleEnded(room)
    }
    for (const l of this.changeListeners) l(room, reason)
  }

  private handleEnded(room: GameRoom): void {
    this.clearHostTimer(room.sessionId)
    for (const l of this.endedListeners) l(room)
    const t = setTimeout(() => this.evict(room.sessionId), ENDED_RETENTION_MS)
    t.unref()
    this.evictTimers.set(room.sessionId, t)
    this.log.info(
      { sessionId: room.sessionId, pin: room.pin, players: room.players.size },
      'room ended',
    )
  }

  /** Called by the socket layer when the host's last socket disconnects. */
  hostDisconnected(sessionId: string): void {
    const room = this.rooms.get(sessionId)
    if (!room || room.status === 'ended') return
    this.clearHostTimer(sessionId)
    const t = setTimeout(() => {
      const r = this.rooms.get(sessionId)
      if (r && r.status !== 'ended') {
        this.log.info({ sessionId }, 'host absent, ending room')
        r.end('host_left')
      }
    }, HOST_GRACE_MS)
    t.unref()
    this.hostTimers.set(sessionId, t)
  }

  hostConnected(sessionId: string): void {
    this.clearHostTimer(sessionId)
  }

  private clearHostTimer(sessionId: string): void {
    const t = this.hostTimers.get(sessionId)
    if (t) {
      clearTimeout(t)
      this.hostTimers.delete(sessionId)
    }
  }

  evict(sessionId: string): void {
    const room = this.rooms.get(sessionId)
    if (!room) return
    room.dispose()
    this.rooms.delete(sessionId)
    this.byPin.delete(room.pin)
    this.clearHostTimer(sessionId)
    const et = this.evictTimers.get(sessionId)
    if (et) clearTimeout(et)
    this.evictTimers.delete(sessionId)
    if (this.redis) {
      void this.redis
        .del(`kq:owner:${sessionId}`, `kq:pin:${room.pin}`, `kq:meta:${sessionId}`)
        .catch((e) => this.log.warn({ err: e }, 'redis cleanup failed'))
    }
    this.log.info({ sessionId, pin: room.pin }, 'room evicted')
  }

  private async refreshOwnership(): Promise<void> {
    if (!this.redis || this.rooms.size === 0) return
    const m = this.redis.multi()
    for (const room of this.rooms.values()) {
      m.expire(`kq:owner:${room.sessionId}`, OWNER_TTL_SEC)
      m.expire(`kq:pin:${room.pin}`, OWNER_TTL_SEC)
      m.expire(`kq:meta:${room.sessionId}`, OWNER_TTL_SEC)
    }
    await m.exec().catch((e) => this.log.warn({ err: e }, 'redis ownership refresh failed'))
  }

  async close(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    for (const t of this.hostTimers.values()) clearTimeout(t)
    for (const t of this.evictTimers.values()) clearTimeout(t)
    for (const room of this.rooms.values()) room.dispose()
    if (this.redis && this.rooms.size) {
      const keys: string[] = []
      for (const room of this.rooms.values()) {
        keys.push(`kq:owner:${room.sessionId}`, `kq:pin:${room.pin}`, `kq:meta:${room.sessionId}`)
      }
      await this.redis.del(...keys).catch(() => undefined)
    }
    this.rooms.clear()
    this.byPin.clear()
  }
}
