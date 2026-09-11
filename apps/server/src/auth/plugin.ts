import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '@kontext/shared'
import type { Config } from '../config.js'
import { unauthorized } from '../errors.js'
import type { Store } from '../store/types.js'
import { SESSION_TTL_SEC, type Jwt } from './jwt.js'

export const SESSION_COOKIE = 'kq_session'

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved lazily from the session cookie; null when anonymous. */
    user: User | null
  }
  interface FastifyInstance {
    config: Config
    store: Store
    jwt: Jwt
    /** preHandler that rejects anonymous requests with 401. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    setSessionCookie: (reply: FastifyReply, userId: string) => Promise<void>
    clearSessionCookie: (reply: FastifyReply) => void
  }
}

export interface AuthPluginOptions {
  config: Config
  store: Store
  jwt: Jwt
}

/** Decorates requests with `user` (from the kq_session cookie) and adds auth helpers. */
export async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  const { config, store, jwt } = opts
  app.decorateRequest('user', null)

  app.addHook('onRequest', async (request) => {
    const raw = request.cookies[SESSION_COOKIE]
    if (!raw) return
    const unsigned = request.unsignCookie(raw)
    if (!unsigned.valid || !unsigned.value) return
    const claims = await jwt.verifySession(unsigned.value)
    if (!claims) return
    if (store.kind === 'memory' && config.isProd) return
    const user = await store.users.findById(claims.sub)
    request.user = user
  })

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    if (!request.user) throw unauthorized()
  })

  app.decorate('setSessionCookie', async (reply: FastifyReply, userId: string) => {
    const token = await jwt.signSession(userId)
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      signed: true,
      maxAge: SESSION_TTL_SEC,
    })
  })

  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
  })
}
