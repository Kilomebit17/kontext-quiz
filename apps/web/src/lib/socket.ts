import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents, ErrorPayload } from '@kontext/shared'
import { API_BASE } from './api'
import { computeOffset, setClockOffset, type ClockSample } from './clock'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const ACK_TIMEOUT_MS = 8000
const PING_COUNT = 5

let socket: AppSocket | null = null
let syncing: Promise<number> | null = null

function endpoint(): string {
  if (API_BASE) return API_BASE
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** Lazily create the singleton socket (not yet connected). */
export function getSocket(): AppSocket {
  if (socket) return socket
  socket = io(endpoint(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })
  return socket
}

export function connect(): AppSocket {
  const s = getSocket()
  if (!s.connected && !s.active) s.connect()
  return s
}

export function disconnect(): void {
  socket?.disconnect()
}

export class SocketError extends Error {
  readonly code: ErrorPayload['code']

  constructor(payload: ErrorPayload) {
    super(payload.message ?? payload.code)
    this.name = 'SocketError'
    this.code = payload.code
  }
}

function isAckFailure(r: unknown): r is { ok: false; error: ErrorPayload } {
  return typeof r === 'object' && r !== null && (r as { ok?: unknown }).ok === false
}

/**
 * Typed emit that resolves with the successful ack payload and rejects with a
 * `SocketError` for `{ ok: false }` acks or timeouts.
 */
/** Ack payload type of a client→server event. */
export type AckOf<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [unknown, (r: infer R) => void]
    ? R
    : Parameters<ClientToServerEvents[E]> extends [(r: infer R) => void]
      ? R
      : never

/** Payload arguments of a client→server event (empty tuple when none). */
export type EmitArgs<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [infer P, (r: never) => void] ? [payload: P] : []

export async function emitWithAck<E extends keyof ClientToServerEvents>(
  event: E,
  ...args: EmitArgs<E>
): Promise<Extract<AckOf<E>, { ok: true }>> {
  const s = connect()
  let result: unknown
  try {
    // socket.io's overloads for optional-payload events are not expressible generically.
    const emitter = s.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck: (event: string, ...args: unknown[]) => Promise<unknown>
    }
    result = await emitter.emitWithAck(event, ...args)
  } catch {
    throw new SocketError({ code: 'INTERNAL', message: 'Timeout' })
  }
  if (isAckFailure(result)) throw new SocketError(result.error)
  return result as Extract<AckOf<E>, { ok: true }>
}

/** Send 5 pings, keep the median offset. Resolves with the offset. */
export function syncClock(): Promise<number> {
  if (syncing) return syncing
  const s = connect()
  syncing = (async () => {
    const samples: ClockSample[] = []
    for (let i = 0; i < PING_COUNT; i++) {
      const t0 = Date.now()
      try {
        const emitter = s.timeout(3000) as unknown as {
          emitWithAck: (
            event: string,
            payload: { t0: number },
          ) => Promise<{ t0: number; serverTime: number }>
        }
        const r = await emitter.emitWithAck('time:ping', { t0 })
        samples.push({ t0, t1: Date.now(), serverTime: r.serverTime })
      } catch {
        // skip failed sample
      }
    }
    const offset = samples.length ? computeOffset(samples) : 0
    if (samples.length) setClockOffset(offset)
    return offset
  })().finally(() => {
    syncing = null
  })
  return syncing
}
