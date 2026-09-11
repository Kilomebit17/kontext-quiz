import type { FastifyBaseLogger } from 'fastify'
import type { Server, Socket } from 'socket.io'
import {
  answerPayloadSchema,
  gameSettingsSchema,
  joinPayloadSchema,
  type Ack,
  type AnswerAck,
  type ClientToServerEvents,
  type GameSettings,
  type GameSnapshot,
  type InterServerEvents,
  type JoinResult,
  type ServerToClientEvents,
  type SocketData,
} from '@kontext/shared'
import type { Jwt } from '../auth/jwt.js'
import { OK, fail, type ErrAck } from './ack.js'
import type { RateLimiter } from '../ratelimit.js'
import {
  Forwarder,
  type ForwardIntent,
  type ForwardRequest,
  type ForwardResult,
} from './forward.js'
import type { RoomManager } from './manager.js'
import type { GameRoom } from './room.js'

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
export type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

const ANSWER_COUNT_THROTTLE_MS = 100
const LOBBY_COALESCE_MS = 50

/** A connected client as seen by the room owner: local socket or a remote one (via forwarding). */
interface Client {
  id: string
  ip: string
  data: SocketData
  local: boolean
}

interface Conn {
  socketId: string
  local: boolean
}

interface RoomConns {
  hosts: Map<string, Conn>
  players: Map<string, Conn>
  countTimer: NodeJS.Timeout | null
  countPending: { answeredCount: number; totalPlayers: number } | null
}

export interface SocketLayerOptions {
  io: IoServer
  manager: RoomManager
  jwt: Jwt
  redis?: import('ioredis').default | null
  logger: FastifyBaseLogger
  joinLimiter: RateLimiter
  /** Counts failed PIN lookups per IP (brute-force protection). */
  pinGuessLimiter: RateLimiter
}

export interface SocketLayer {
  forwarder: Forwarder
  start(): Promise<void>
  close(): Promise<void>
}

export function createSocketLayer(opts: SocketLayerOptions): SocketLayer {
  const { io, manager, jwt, logger: log, joinLimiter, pinGuessLimiter } = opts
  const conns = new Map<string, RoomConns>()
  const roomOf = (sessionId: string): RoomConns => {
    let c = conns.get(sessionId)
    if (!c) {
      c = { hosts: new Map(), players: new Map(), countTimer: null, countPending: null }
      conns.set(sessionId, c)
    }
    return c
  }

  // ---------------------------------------------------------------------------
  // Emission helpers (local socket → direct; remote → via adapter)
  // ---------------------------------------------------------------------------

  function emitTo<E extends keyof ServerToClientEvents>(
    conn: Conn,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    if (conn.local) {
      const s = io.sockets.sockets.get(conn.socketId)
      if (s) {
        s.emit(event, ...args)
        return
      }
    }
    io.to(conn.socketId).emit(event, ...args)
  }

  function broadcast(room: GameRoom): void {
    const c = conns.get(room.sessionId)
    if (!c) return
    if (c.hosts.size) {
      const hostSnap = room.hostSnapshot()
      for (const conn of c.hosts.values()) emitTo(conn, 'state', hostSnap)
    }
    if (c.players.size) {
      const base = room.playerBase()
      for (const [playerId, conn] of c.players) {
        const p = room.players.get(playerId)
        if (!p || !p.connected) continue
        emitTo(conn, 'state', room.withMe(base, playerId))
      }
    }
  }

  function emitAnswerCount(room: GameRoom, answeredCount: number, totalPlayers: number): void {
    const c = conns.get(room.sessionId)
    if (!c || c.hosts.size === 0) return
    const send = (payload: { answeredCount: number; totalPlayers: number }) => {
      for (const conn of c.hosts.values()) emitTo(conn, 'answer:count', payload)
    }
    if (c.countTimer) {
      c.countPending = { answeredCount, totalPlayers }
      return
    }
    send({ answeredCount, totalPlayers })
    c.countTimer = setTimeout(() => {
      c.countTimer = null
      if (c.countPending) {
        const p = c.countPending
        c.countPending = null
        send(p)
      }
    }, ANSWER_COUNT_THROTTLE_MS)
  }

  // Phase changes broadcast immediately; lobby membership churn (200 players joining
  // within a second) is coalesced so fan-out stays O(n) per window instead of O(n²).
  const lobbyTimers = new Map<string, NodeJS.Timeout>()
  manager.onChange((room, reason) => {
    const pending = lobbyTimers.get(room.sessionId)
    if (reason === 'phase') {
      if (pending) {
        clearTimeout(pending)
        lobbyTimers.delete(room.sessionId)
      }
      broadcast(room)
      return
    }
    if (pending) return
    lobbyTimers.set(
      room.sessionId,
      setTimeout(() => {
        lobbyTimers.delete(room.sessionId)
        broadcast(room)
      }, LOBBY_COALESCE_MS),
    )
  })
  manager.onAnswerCount((room, a, t) => emitAnswerCount(room, a, t))
  manager.onEnded((room) => {
    const c = conns.get(room.sessionId)
    if (c?.countTimer) {
      clearTimeout(c.countTimer)
      c.countTimer = null
    }
  })

  // ---------------------------------------------------------------------------
  // Local handlers (run on the owning instance)
  // ---------------------------------------------------------------------------

  function hostRoom(client: Client): { room: GameRoom } | { error: ErrAck } {
    if (client.data.role !== 'host' || !client.data.sessionId) return { error: fail('NOT_HOST') }
    const room = manager.get(client.data.sessionId)
    if (!room) return { error: fail('GAME_NOT_FOUND') }
    return { room }
  }

  function playerRoom(client: Client): { room: GameRoom; playerId: string } | { error: ErrAck } {
    if (client.data.role !== 'player' || !client.data.sessionId || !client.data.playerId) {
      return { error: fail('INVALID_TOKEN', 'Join first') }
    }
    const room = manager.get(client.data.sessionId)
    if (!room) return { error: fail('GAME_NOT_FOUND') }
    return { room, playerId: client.data.playerId }
  }

  function hostJoin(client: Client, sessionId: string): Ack<{ snapshot: GameSnapshot }> {
    const room = manager.get(sessionId)
    if (!room) return fail('GAME_NOT_FOUND')
    const c = roomOf(sessionId)
    c.hosts.set(client.id, { socketId: client.id, local: client.local })
    client.data.role = 'host'
    client.data.sessionId = sessionId
    client.data.playerId = null
    manager.hostConnected(sessionId)
    return { ok: true, snapshot: room.hostSnapshot() }
  }

  type SimpleHostIntent = 'host:start' | 'host:next' | 'host:end' | 'host:cancel'

  function hostSimple(client: Client, intent: SimpleHostIntent): Ack {
    const r = hostRoom(client)
    if ('error' in r) return r.error
    if (intent === 'host:start') return r.room.start()
    if (intent === 'host:next') return r.room.next()
    if (intent === 'host:cancel') return r.room.end('cancelled')
    return r.room.end()
  }

  function hostKick(client: Client, payload: unknown): Ack {
    const r = hostRoom(client)
    if ('error' in r) return r.error
    const playerId = (payload as { playerId?: unknown } | null)?.playerId
    if (typeof playerId !== 'string') return fail('INVALID_ANSWER', 'playerId required')
    const c = roomOf(r.room.sessionId)
    const conn = c.players.get(playerId)
    const res = r.room.kick(playerId)
    if (res.ok && conn) {
      emitTo(conn, 'kicked')
      c.players.delete(playerId)
      if (conn.local) {
        const s = io.sockets.sockets.get(conn.socketId)
        if (s) {
          s.data.role = null
          s.data.playerId = null
          s.data.sessionId = null
          void s.leave(`sess:${r.room.sessionId}`)
        }
      }
    }
    return res
  }

  function hostSettings(client: Client, payload: unknown): Ack {
    const r = hostRoom(client)
    if ('error' in r) return r.error
    const parsed = gameSettingsSchema.partial().safeParse(payload)
    if (!parsed.success) return fail('INVALID_ANSWER', 'Invalid settings')
    return r.room.updateSettings(parsed.data as Partial<GameSettings>)
  }

  async function playerJoin(
    client: Client,
    payload: { pin: string; nickname: string; teamId?: string | null; avatar?: string | null },
  ): Promise<Ack<JoinResult>> {
    const room = manager.getByPin(payload.pin)
    if (!room) return fail('GAME_NOT_FOUND')
    // A socket re-joining drops its previous identity.
    if (client.data.role === 'player' && client.data.playerId && client.data.sessionId) {
      const prev = manager.get(client.data.sessionId)
      prev?.leavePlayer(client.data.playerId)
      conns.get(client.data.sessionId)?.players.delete(client.data.playerId)
    }
    const res = room.addPlayer(payload.nickname, {
      teamId: payload.teamId ?? null,
      avatar: payload.avatar ?? null,
    })
    if (!res.ok) return res
    const token = await jwt.signPlayer(room.sessionId, res.playerId)
    roomOf(room.sessionId).players.set(res.playerId, { socketId: client.id, local: client.local })
    client.data.role = 'player'
    client.data.sessionId = room.sessionId
    client.data.playerId = res.playerId
    return {
      ok: true,
      playerId: res.playerId,
      token,
      nickname: res.nickname,
      avatar: res.avatar,
      sessionId: room.sessionId,
    }
  }

  function playerResume(
    client: Client,
    claims: { sessionId: string; playerId: string },
  ): Ack<{ snapshot: GameSnapshot }> {
    const room = manager.get(claims.sessionId)
    if (!room) return fail('GAME_NOT_FOUND')
    const res = room.resumePlayer(claims.playerId)
    if (!res.ok) return res
    roomOf(room.sessionId).players.set(claims.playerId, {
      socketId: client.id,
      local: client.local,
    })
    client.data.role = 'player'
    client.data.sessionId = room.sessionId
    client.data.playerId = claims.playerId
    return { ok: true, snapshot: room.withMe(room.playerBase(), claims.playerId) }
  }

  function playerAnswer(client: Client, payload: unknown, receivedAt: number): Ack<AnswerAck> {
    const r = playerRoom(client)
    if ('error' in r) return r.error
    const parsed = answerPayloadSchema.safeParse(payload)
    if (!parsed.success) return fail('INVALID_ANSWER')
    return r.room.submitAnswer(r.playerId, parsed.data, receivedAt)
  }

  function playerTeam(client: Client, payload: unknown): Ack {
    const r = playerRoom(client)
    if ('error' in r) return r.error
    const teamId = (payload as { teamId?: unknown } | null)?.teamId
    if (typeof teamId !== 'string') return fail('INVALID_ANSWER', 'teamId required')
    return r.room.setTeam(r.playerId, teamId)
  }

  function playerLeave(client: Client): void {
    const r = playerRoom(client)
    if ('error' in r) return
    r.room.leavePlayer(r.playerId)
    conns.get(r.room.sessionId)?.players.delete(r.playerId)
    client.data.role = null
    client.data.playerId = null
    client.data.sessionId = null
  }

  function clientDisconnected(client: Client): void {
    const { role, sessionId, playerId } = client.data
    if (!sessionId) return
    const c = conns.get(sessionId)
    if (role === 'host') {
      c?.hosts.delete(client.id)
      if (!c || c.hosts.size === 0) manager.hostDisconnected(sessionId)
    } else if (role === 'player' && playerId) {
      const conn = c?.players.get(playerId)
      // Only the socket that currently represents the player may mark it disconnected.
      if (conn && conn.socketId === client.id) {
        c?.players.delete(playerId)
        manager.get(sessionId)?.disconnectPlayer(playerId)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Forwarded intents (this instance owns the room; the socket lives elsewhere)
  // ---------------------------------------------------------------------------

  async function handleForwarded(req: ForwardRequest): Promise<ForwardResult> {
    const client: Client = { id: req.socketId, ip: req.ip, data: { ...req.data }, local: false }
    const done = (ack: unknown): ForwardResult => ({ ack, data: client.data })
    switch (req.intent) {
      case 'host:join':
        return done(hostJoin(client, (req.payload as { sessionId: string }).sessionId))
      case 'host:start':
      case 'host:next':
      case 'host:end':
      case 'host:cancel':
        return done(hostSimple(client, req.intent))
      case 'host:kick':
        return done(hostKick(client, req.payload))
      case 'host:settings':
        return done(hostSettings(client, req.payload))
      case 'player:join':
        return done(await playerJoin(client, req.payload as { pin: string; nickname: string }))
      case 'player:resume':
        return done(playerResume(client, req.payload as { sessionId: string; playerId: string }))
      case 'player:answer':
        return done(playerAnswer(client, req.payload, req.receivedAt))
      case 'player:team':
        return done(playerTeam(client, req.payload))
      case 'player:leave':
        playerLeave(client)
        return done(OK)
      case 'disconnect':
        clientDisconnected(client)
        return done(OK)
    }
  }

  const forwarder = new Forwarder({
    instanceId: manager.instanceId,
    redis: opts.redis ?? null,
    logger: log,
    handler: handleForwarded,
  })

  // ---------------------------------------------------------------------------
  // Socket.IO wiring
  // ---------------------------------------------------------------------------

  const ipOf = (socket: IoSocket): string => {
    const fwd = socket.handshake.headers['x-forwarded-for']
    const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]
    return (first ?? socket.handshake.address ?? 'unknown').trim()
  }

  const localClient = (socket: IoSocket): Client => ({
    id: socket.id,
    ip: ipOf(socket),
    data: socket.data,
    local: true,
  })

  /** Run an intent locally if the room lives here, otherwise forward it. */
  async function dispatch<T>(
    socket: IoSocket,
    sessionId: string | null,
    intent: ForwardIntent,
    payload: unknown,
    local: () => T | Promise<T>,
    receivedAt = Date.now(),
  ): Promise<T> {
    if (sessionId && manager.get(sessionId)) return local()
    if (!sessionId) return fail('GAME_NOT_FOUND') as T
    const ownerId = await manager.ownerOf(sessionId)
    if (!ownerId) return fail('GAME_NOT_FOUND') as T
    if (ownerId === manager.instanceId) return local()
    const res = await forwarder.request(ownerId, {
      intent,
      socketId: socket.id,
      ip: ipOf(socket),
      data: { ...socket.data },
      payload,
      receivedAt,
    })
    if (res.data) {
      socket.data.role = res.data.role
      socket.data.sessionId = res.data.sessionId
      socket.data.playerId = res.data.playerId
    }
    return res.ack as T
  }

  io.on('connection', (socket) => {
    socket.data.role = null
    socket.data.sessionId = null
    socket.data.playerId = null
    const slog = log.child({ socketId: socket.id })

    socket.on('time:ping', (payload, ack) => {
      if (typeof ack === 'function') ack({ t0: Number(payload?.t0 ?? 0), serverTime: Date.now() })
    })

    const safe = <A extends unknown[]>(fn: (...args: A) => Promise<void> | void) => {
      return (...args: A) => {
        try {
          const r = fn(...args)
          if (r && typeof (r as Promise<void>).catch === 'function') {
            ;(r as Promise<void>).catch((e) => {
              slog.error({ err: e }, 'socket handler failed')
              const ack = args[args.length - 1]
              if (typeof ack === 'function') (ack as (r: Ack) => void)(fail('INTERNAL'))
            })
          }
        } catch (e) {
          slog.error({ err: e }, 'socket handler threw')
          const ack = args[args.length - 1]
          if (typeof ack === 'function') (ack as (r: Ack) => void)(fail('INTERNAL'))
        }
      }
    }

    const withAck = <R>(ack: unknown, r: R) => {
      if (typeof ack === 'function') (ack as (r: R) => void)(r)
    }

    socket.on(
      'host:join',
      safe(async (payload, ack) => {
        const token = (payload as { hostToken?: unknown } | null)?.hostToken
        if (typeof token !== 'string') return withAck(ack, fail('INVALID_TOKEN'))
        const claims = await jwt.verifyHost(token)
        if (!claims) return withAck(ack, fail('INVALID_TOKEN'))
        const res = await dispatch(
          socket,
          claims.sessionId,
          'host:join',
          { sessionId: claims.sessionId },
          () => hostJoin(localClient(socket), claims.sessionId),
        )
        if (res.ok) {
          await socket.join(`sess:${claims.sessionId}:host`)
          slog.info({ sessionId: claims.sessionId }, 'host joined')
        }
        withAck(ack, res)
      }),
    )

    for (const intent of ['host:start', 'host:next', 'host:end', 'host:cancel'] as const) {
      socket.on(
        intent,
        safe(async (ack) => {
          if (socket.data.role !== 'host') return withAck(ack, fail('NOT_HOST'))
          const res = await dispatch(socket, socket.data.sessionId, intent, null, () =>
            hostSimple(localClient(socket), intent),
          )
          withAck(ack, res)
        }),
      )
    }

    socket.on(
      'host:kick',
      safe(async (payload, ack) => {
        if (socket.data.role !== 'host') return withAck(ack, fail('NOT_HOST'))
        const res = await dispatch(socket, socket.data.sessionId, 'host:kick', payload, () =>
          hostKick(localClient(socket), payload),
        )
        withAck(ack, res)
      }),
    )

    socket.on(
      'host:settings',
      safe(async (payload, ack) => {
        if (socket.data.role !== 'host') return withAck(ack, fail('NOT_HOST'))
        const res = await dispatch(socket, socket.data.sessionId, 'host:settings', payload, () =>
          hostSettings(localClient(socket), payload),
        )
        withAck(ack, res)
      }),
    )

    socket.on(
      'player:join',
      safe(async (payload, ack) => {
        const parsed = joinPayloadSchema.safeParse(payload)
        if (!parsed.success) {
          const pinBad = parsed.error.issues.some((i) => i.path[0] === 'pin')
          return withAck(ack, fail(pinBad ? 'INVALID_PIN' : 'NICKNAME_INVALID'))
        }
        const ip = ipOf(socket)
        if (!(await joinLimiter.hit(ip))) return withAck(ack, fail('RATE_LIMITED'))
        const sessionId = await manager.sessionIdForPin(parsed.data.pin)
        if (!sessionId) {
          // Only failed guesses count towards the brute-force limit, so a venue
          // behind a single NAT IP can still join hundreds of players.
          const allowed = await pinGuessLimiter.hit(ip)
          return withAck(ack, fail(allowed ? 'GAME_NOT_FOUND' : 'RATE_LIMITED'))
        }
        const res = await dispatch(socket, sessionId, 'player:join', parsed.data, () =>
          playerJoin(localClient(socket), parsed.data),
        )
        if (res.ok) {
          await socket.join(`sess:${res.sessionId}`)
          slog.info({ sessionId: res.sessionId, playerId: res.playerId }, 'player joined')
        }
        withAck(ack, res)
      }),
    )

    socket.on(
      'player:resume',
      safe(async (payload, ack) => {
        const token = (payload as { token?: unknown } | null)?.token
        if (typeof token !== 'string') return withAck(ack, fail('INVALID_TOKEN'))
        const claims = await jwt.verifyPlayer(token)
        if (!claims) return withAck(ack, fail('INVALID_TOKEN'))
        const res = await dispatch(socket, claims.sessionId, 'player:resume', claims, () =>
          playerResume(localClient(socket), claims),
        )
        if (res.ok) await socket.join(`sess:${claims.sessionId}`)
        withAck(ack, res)
      }),
    )

    socket.on(
      'player:answer',
      safe(async (payload, ack) => {
        const receivedAt = Date.now()
        if (socket.data.role !== 'player') return withAck(ack, fail('INVALID_TOKEN', 'Join first'))
        const res = await dispatch(
          socket,
          socket.data.sessionId,
          'player:answer',
          payload,
          () => playerAnswer(localClient(socket), payload, receivedAt),
          receivedAt,
        )
        withAck(ack, res)
      }),
    )

    socket.on(
      'player:team',
      safe(async (payload, ack) => {
        if (socket.data.role !== 'player') return withAck(ack, fail('INVALID_TOKEN', 'Join first'))
        const res = await dispatch(socket, socket.data.sessionId, 'player:team', payload, () =>
          playerTeam(localClient(socket), payload),
        )
        withAck(ack, res)
      }),
    )

    socket.on(
      'player:leave',
      safe(async () => {
        const sessionId = socket.data.sessionId
        await dispatch(socket, sessionId, 'player:leave', null, () => {
          playerLeave(localClient(socket))
          return OK
        })
        if (sessionId) await socket.leave(`sess:${sessionId}`)
      }),
    )

    socket.on('disconnect', () => {
      const { sessionId } = socket.data
      if (!sessionId) return
      if (manager.get(sessionId)) {
        clientDisconnected(localClient(socket))
        return
      }
      void manager.ownerOf(sessionId).then((ownerId) => {
        if (ownerId && ownerId !== manager.instanceId) {
          forwarder.notify(ownerId, {
            intent: 'disconnect',
            socketId: socket.id,
            ip: ipOf(socket),
            data: { ...socket.data },
            payload: null,
            receivedAt: Date.now(),
          })
        }
      })
    })
  })

  return {
    forwarder,
    start: () => forwarder.start(),
    close: async () => {
      for (const c of conns.values()) if (c.countTimer) clearTimeout(c.countTimer)
      for (const t of lobbyTimers.values()) clearTimeout(t)
      lobbyTimers.clear()
      conns.clear()
      await forwarder.close()
    },
  }
}
