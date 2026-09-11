import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import type { SocketData } from '@kontext/shared'

export type ForwardIntent =
  | 'host:join'
  | 'host:start'
  | 'host:next'
  | 'host:kick'
  | 'host:end'
  | 'host:cancel'
  | 'host:settings'
  | 'player:join'
  | 'player:resume'
  | 'player:answer'
  | 'player:team'
  | 'player:leave'
  | 'disconnect'

export interface ForwardRequest {
  kind: 'req'
  requestId: string
  from: string
  intent: ForwardIntent
  socketId: string
  ip: string
  data: SocketData
  payload: unknown
  /** Server receipt time on the requesting instance (for answers). */
  receivedAt: number
  /** Fire-and-forget: no response expected. */
  noReply?: boolean
}

export interface ForwardResult {
  ack: unknown
  /** Updated socket data for the requesting socket (after join/resume). */
  data?: SocketData
}

interface ForwardResponse extends ForwardResult {
  kind: 'res'
  requestId: string
}

export type ForwardHandler = (req: ForwardRequest) => Promise<ForwardResult>

const REQUEST_TIMEOUT_MS = 5000
const WRONG_INSTANCE = { ok: false, error: { code: 'WRONG_INSTANCE' } } as const

/**
 * Forwards intents to the instance that owns a room over Redis pub/sub with a
 * request/response envelope. Without Redis every request fails fast with
 * WRONG_INSTANCE (single-instance deployments never hit this path).
 */
export class Forwarder {
  readonly instanceId: string
  private readonly pub: Redis | null
  private sub: Redis | null = null
  private readonly log: FastifyBaseLogger
  private readonly handler: ForwardHandler
  private readonly pending = new Map<
    string,
    { resolve: (r: ForwardResult) => void; timer: NodeJS.Timeout }
  >()

  constructor(opts: {
    instanceId: string
    redis?: Redis | null
    logger: FastifyBaseLogger
    handler: ForwardHandler
  }) {
    this.instanceId = opts.instanceId
    this.pub = opts.redis ?? null
    this.log = opts.logger
    this.handler = opts.handler
  }

  get enabled(): boolean {
    return this.pub !== null
  }

  private channel(instanceId: string): string {
    return `kq:instance:${instanceId}`
  }

  async start(): Promise<void> {
    if (!this.pub) return
    this.sub = this.pub.duplicate()
    await this.sub.subscribe(this.channel(this.instanceId))
    this.sub.on('message', (_channel, raw) => {
      void this.onMessage(raw)
    })
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: ForwardRequest | ForwardResponse
    try {
      msg = JSON.parse(raw) as ForwardRequest | ForwardResponse
    } catch {
      return
    }
    if (msg.kind === 'res') {
      const p = this.pending.get(msg.requestId)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(msg.requestId)
      p.resolve({ ack: msg.ack, data: msg.data })
      return
    }
    if (msg.kind !== 'req') return
    let result: ForwardResult
    try {
      result = await this.handler(msg)
    } catch (e) {
      this.log.error({ err: e, intent: msg.intent }, 'forwarded intent failed')
      result = { ack: { ok: false, error: { code: 'INTERNAL' } } }
    }
    if (msg.noReply || !this.pub) return
    const res: ForwardResponse = { kind: 'res', requestId: msg.requestId, ...result }
    await this.pub.publish(this.channel(msg.from), JSON.stringify(res)).catch((e) => {
      this.log.warn({ err: e }, 'forward response publish failed')
    })
  }

  async request(
    ownerId: string,
    req: Omit<ForwardRequest, 'kind' | 'requestId' | 'from'>,
  ): Promise<ForwardResult> {
    if (!this.pub) return { ack: WRONG_INSTANCE }
    const requestId = randomUUID()
    const msg: ForwardRequest = { kind: 'req', requestId, from: this.instanceId, ...req }
    const promise = new Promise<ForwardResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve({ ack: WRONG_INSTANCE })
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(requestId, { resolve, timer })
    })
    try {
      await this.pub.publish(this.channel(ownerId), JSON.stringify(msg))
    } catch (e) {
      this.log.warn({ err: e }, 'forward publish failed')
    }
    return promise
  }

  /** Fire-and-forget notification (e.g. disconnect). */
  notify(
    ownerId: string,
    req: Omit<ForwardRequest, 'kind' | 'requestId' | 'from' | 'noReply'>,
  ): void {
    if (!this.pub) return
    const msg: ForwardRequest = {
      kind: 'req',
      requestId: randomUUID(),
      from: this.instanceId,
      noReply: true,
      ...req,
    }
    void this.pub.publish(this.channel(ownerId), JSON.stringify(msg)).catch(() => undefined)
  }

  async close(): Promise<void> {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.resolve({ ack: WRONG_INSTANCE })
    }
    this.pending.clear()
    if (this.sub) {
      await this.sub.quit().catch(() => undefined)
      this.sub = null
    }
  }
}
