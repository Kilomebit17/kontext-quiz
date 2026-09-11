import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import fastifyOauth2, { type OAuth2Namespace } from '@fastify/oauth2'
import { z } from 'zod'
import { avatarUpdateSchema, passwordLoginSchema } from '@kontext/shared'
import type { Mailer } from '../auth/mail.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { conflict, noDatabase, notFound, unauthorized } from '../errors.js'
import type { Store } from '../store/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace
  }
}

const MAGIC_LINK_TTL_MS = 15 * 60_000

const magicLinkBody = z.object({ email: z.string().trim().toLowerCase().email().max(254) })

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Host'
  return (
    local
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 60) || 'Host'
  )
}

/** Derive a free handle from an email's local part: "olena.k" → "olena.k", "olena.k2" … */
async function handleFromEmail(store: Store, email: string): Promise<string> {
  const base =
    (email.split('@')[0] ?? 'host')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}_.-]+/gu, '')
      .replace(/^[_.-]+/, '')
      .slice(0, 20) || 'host'
  if (!(await store.users.findByNickname(base))) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base.slice(0, 20 - String(i).length)}${i}`
    if (!(await store.users.findByNickname(candidate))) return candidate
  }
  return `${base.slice(0, 12)}${Date.now().toString(36)}`
}

export async function authRoutes(app: FastifyInstance, opts: { mailer: Mailer }): Promise<void> {
  const { config, store, jwt } = app
  const requireDb = () => {
    if (store.kind === 'memory') throw noDatabase()
  }

  app.post(
    '/api/auth/magic-link',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      requireDb()
      const { email } = magicLinkBody.parse(request.body)
      const token = randomBytes(32).toString('base64url')
      await store.magicLinks.create(token, email, new Date(Date.now() + MAGIC_LINK_TTL_MS))
      const link = `${config.API_ORIGIN}/api/auth/magic-link/verify?token=${token}`
      if (opts.mailer.configured) {
        await opts.mailer.sendMagicLink(email, link)
        return reply.code(202).send({ ok: true })
      }
      if (config.isProd) {
        request.log.error({ email }, 'SMTP not configured in production; magic link not sent')
        return reply.code(202).send({ ok: true })
      }
      request.log.info({ email, link }, 'magic link (SMTP not configured)')
      return reply.code(202).send({ ok: true, devLink: link })
    },
  )

  app.get('/api/auth/magic-link/verify', async (request, reply) => {
    const token = (request.query as { token?: string }).token
    const fail = () => reply.redirect(`${config.WEB_ORIGIN}/login?error=invalid_link`, 302)
    if (store.kind === 'memory' || !token) return fail()
    const email = await store.magicLinks.consume(token, new Date())
    if (!email) return fail()
    let user = await store.users.findByEmail(email)
    if (!user)
      user = await store.users.create({
        nickname: await handleFromEmail(store, email),
        email,
        name: nameFromEmail(email),
      })
    await app.setSessionCookie(reply, user.id)
    return reply.redirect(`${config.WEB_ORIGIN}/host`, 302)
  })

  const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
  if (googleEnabled) {
    await app.register(fastifyOauth2, {
      name: 'googleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: {
          id: config.GOOGLE_CLIENT_ID as string,
          secret: config.GOOGLE_CLIENT_SECRET as string,
        },
        auth: fastifyOauth2.GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/api/auth/google',
      callbackUri: `${config.API_ORIGIN}/api/auth/google/callback`,
      cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd },
    })

    app.get('/api/auth/google/callback', async (request, reply) => {
      const fail = () => reply.redirect(`${config.WEB_ORIGIN}/login?error=google`, 302)
      if (store.kind === 'memory') return fail()
      try {
        const oauth = app.googleOAuth2 as OAuth2Namespace
        const { token } = await oauth.getAccessTokenFromAuthorizationCodeFlow(request, reply)
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        })
        if (!res.ok) return fail()
        const info = (await res.json()) as { sub?: string; email?: string; name?: string }
        if (!info.sub || !info.email) return fail()
        const email = info.email.toLowerCase()
        let user = await store.users.findByGoogleId(info.sub)
        if (!user) {
          user = await store.users.findByEmail(email)
          if (user) await store.users.setGoogleId(user.id, info.sub)
          else
            user = await store.users.create({
              nickname: await handleFromEmail(store, email),
              email,
              name: info.name || nameFromEmail(email),
              googleId: info.sub,
            })
        }
        await app.setSessionCookie(reply, user.id)
        return reply.redirect(`${config.WEB_ORIGIN}/host`, 302)
      } catch (e) {
        request.log.warn({ err: e }, 'google oauth failed')
        return fail()
      }
    })
  } else {
    app.get('/api/auth/google', async () => {
      throw notFound('NOT_CONFIGURED', 'Google OAuth is not configured')
    })
    app.get('/api/auth/google/callback', async () => {
      throw notFound('NOT_CONFIGURED', 'Google OAuth is not configured')
    })
  }

  /**
   * Nickname + password. One endpoint for both sign-up and sign-in: an unknown
   * handle creates the account, a known one must match its password.
   * Works in memory mode too (accounts then live until the server restarts).
   */
  app.post(
    '/api/auth/password',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { nickname, password } = passwordLoginSchema.parse(request.body)
      const existing = await store.users.findByNickname(nickname)
      if (!existing) {
        const user = await store.users.create({
          nickname,
          name: nickname,
          passwordHash: await hashPassword(password),
        })
        await app.setSessionCookie(reply, user.id)
        return reply.code(201).send({ user, created: true })
      }
      if (!existing.passwordHash) {
        throw conflict(
          'PASSWORD_NOT_SET',
          'This account was created with email or Google; log in that way',
        )
      }
      if (!(await verifyPassword(password, existing.passwordHash))) {
        throw unauthorized('INVALID_CREDENTIALS', 'Wrong password')
      }
      await app.setSessionCookie(reply, existing.user.id)
      return { user: existing.user, created: false }
    },
  )

  /** Which login methods this deployment offers (the web hides the rest). */
  app.get('/api/auth/providers', async () => ({
    password: true,
    email: store.kind !== 'memory',
    google: googleEnabled && store.kind !== 'memory',
  }))

  app.get('/api/auth/me', async (request) => ({ user: request.user ?? null }))

  /** Change the signed-in user's avatar (any id from the shared catalogue). */
  app.patch(
    '/api/auth/me',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      if (!request.user) throw unauthorized('UNAUTHORIZED', 'Log in first')
      const { avatar } = avatarUpdateSchema.parse(request.body)
      const user = await store.users.updateAvatar(request.user.id, avatar)
      if (!user) throw notFound('USER_NOT_FOUND', 'User not found')
      return { user }
    },
  )

  app.post('/api/auth/logout', async (_request, reply) => {
    app.clearSessionCookie(reply)
    return { ok: true }
  })

  void jwt
}
