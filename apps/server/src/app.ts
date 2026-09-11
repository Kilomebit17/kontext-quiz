import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type Redis from 'ioredis'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { ZodError } from 'zod'
import { Jwt } from './auth/jwt.js'
import { createMailer, type Mailer } from './auth/mail.js'
import { authPlugin } from './auth/plugin.js'
import type { Config } from './config.js'
import { HttpError } from './errors.js'
import { RoomManager } from './game/manager.js'
import { createSocketLayer, type IoServer } from './game/socket.js'
import { createRateLimiter } from './ratelimit.js'
import { authRoutes } from './routes/auth.js'
import { challengeRoutes } from './routes/challenges.js'
import { gameRoutes } from './routes/games.js'
import { healthRoutes } from './routes/health.js'
import { historyRoutes } from './routes/history.js'
import { libraryRoutes } from './routes/library.js'
import { quizRoutes } from './routes/quizzes.js'
import type { Store } from './store/types.js'

export interface CreateAppOptions {
  config: Config
  store: Store
  redis?: Redis | null
  mailer?: Mailer
  instanceId?: string
}

export interface App {
  app: FastifyInstance
  io: IoServer
  manager: RoomManager
  instanceId: string
  /** Start listening; resolves with the bound URL. */
  listen(): Promise<string>
  /** Close sockets, HTTP, rooms (does not close the store/redis passed in). */
  close(): Promise<void>
}

export async function createApp(opts: CreateAppOptions): Promise<App> {
  const { config, store } = opts
  const redis = opts.redis ?? null
  const instanceId = opts.instanceId ?? config.INSTANCE_ID ?? randomUUID().slice(0, 8)

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.isDev
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
    genReqId: () => randomUUID().slice(0, 12),
    bodyLimit: 2 * 1024 * 1024,
  })

  const jwt = new Jwt(config.JWT_SECRET)
  app.decorate('config', config)
  app.decorate('store', store)
  app.decorate('jwt', jwt)

  // Error shape: { error: { code, message } }
  app.setErrorHandler((err: unknown, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } })
    }
    if (err instanceof ZodError) {
      const first = err.issues[0]
      const message = first
        ? `${first.path.join('.') || 'body'}: ${first.message}`
        : 'Invalid request'
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message, issues: err.issues } })
    }
    const e = (err ?? {}) as { statusCode?: unknown; code?: unknown; message?: unknown }
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500
    if (status === 429) {
      return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
    }
    if (status >= 500) {
      request.log.error({ err }, 'unhandled error')
      return reply
        .code(status)
        .send({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    }
    return reply.code(status).send({
      error: {
        code: typeof e.code === 'string' ? e.code : 'BAD_REQUEST',
        message: typeof e.message === 'string' ? e.message : 'Bad request',
      },
    })
  })
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  })

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: false })
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true })
  await app.register(cookie, { secret: config.COOKIE_SECRET })
  await app.register(rateLimit, {
    global: false,
    redis: redis ?? undefined,
    nameSpace: 'kq:rl:',
    keyGenerator: (request) => request.ip,
  })
  // Applied directly (not via register) so the decorators are visible to every route plugin.
  await authPlugin(app, { config, store, jwt })

  // ---- Socket.IO --------------------------------------------------------------
  const io: IoServer = new Server(app.server, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    cors: { origin: config.WEB_ORIGIN, credentials: true },
    serveClient: false,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
  })
  let adapterSub: Redis | null = null
  if (redis) {
    adapterSub = redis.duplicate()
    io.adapter(createAdapter(redis, adapterSub))
  }

  const manager = new RoomManager({ instanceId, redis, logger: app.log })
  const joinLimiter = createRateLimiter(
    { max: config.JOIN_RATE_LIMIT_PER_MIN, windowMs: 60_000, prefix: 'kq:join' },
    redis,
  )
  const pinGuessLimiter = createRateLimiter(
    { max: config.PIN_GUESS_LIMIT_PER_MIN, windowMs: 60_000, prefix: 'kq:pinguess' },
    redis,
  )
  const sockets = createSocketLayer({
    io,
    manager,
    jwt,
    redis,
    logger: app.log,
    joinLimiter,
    pinGuessLimiter,
  })

  // ---- Routes ------------------------------------------------------------------
  const mailer = opts.mailer ?? createMailer(config)
  await app.register(healthRoutes, { manager, io, instanceId })
  await app.register(authRoutes, { mailer })
  await app.register(quizRoutes)
  await app.register(libraryRoutes)
  await app.register(gameRoutes, { manager })
  await app.register(historyRoutes)
  await app.register(challengeRoutes)

  if (store.kind === 'memory') {
    app.log.warn(
      'Running with the in-memory store: no persistence, auth routes disabled (503 NO_DATABASE). Set DATABASE_URL to use Postgres.',
    )
  }
  if (!redis) app.log.info('Redis not configured: single-instance mode (no adapter, no forwarding)')

  await sockets.start()
  await app.ready()

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await sockets.close()
    await manager.close()
    io.local.disconnectSockets(true)
    io.engine.close()
    if (adapterSub) {
      await io.of('/').adapter.close?.()
      await adapterSub.quit().catch(() => undefined)
    }
    await app.close()
  }

  return {
    app,
    io,
    manager,
    instanceId,
    listen: async () => {
      const url = await app.listen({ port: config.PORT, host: config.HOST })
      return url
    },
    close,
  }
}
