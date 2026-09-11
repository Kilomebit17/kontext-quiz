import { io as connect, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@kontext/shared'
import { createApp, type App } from '../../src/app.js'
import { testConfig } from '../../src/config.js'
import { MemoryStore } from '../../src/store/memory.js'

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export interface TestServer {
  server: App
  store: MemoryStore
  url: string
  close(): Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
  const store = new MemoryStore()
  const server = await createApp({
    config: testConfig(),
    store,
    mailer: { configured: false, sendMagicLink: async () => {} },
  })
  const url = await server.listen()
  return {
    server,
    store,
    url,
    close: async () => {
      await server.close()
      await store.close()
    },
  }
}

export function connectSocket(url: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s: ClientSocket = connect(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    })
    s.once('connect', () => resolve(s))
    s.once('connect_error', reject)
  })
}

/** Emit an event and resolve with its ack. */
export function emitAck<T>(socket: ClientSocket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(socket as any).emit(event, ...args, (r: T) => resolve(r))
  })
}

/** Resolve with the next event payload (or reject after `timeoutMs`). */
export function nextEvent<T>(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(socket as any).once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

/** Wait until a `state` event satisfies `pred`. */
export function waitForState<T extends { status: string }>(
  socket: ClientSocket,
  pred: (s: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(socket as any).off('state', handler)
      reject(new Error('timeout waiting for state'))
    }, timeoutMs)
    const handler = (s: T) => {
      if (pred(s)) {
        clearTimeout(timer)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(socket as any).off('state', handler)
        resolve(s)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(socket as any).on('state', handler)
  })
}

export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}
