import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  createGameSchema,
  isValidPin,
  type GameMode,
  type GameResult,
  type GameStatus,
  type Question,
} from '@kontext/shared'
import { badRequest, forbidden, notFound, unauthorized } from '../errors.js'
import { resultToCsv } from '../game/csv.js'
import type { RoomManager } from '../game/manager.js'
import { persistRoomResult } from '../game/persist.js'
import { sanitizeQuizInput } from '../sanitize.js'
import { canReadQuiz } from './quizzes.js'

export async function gameRoutes(
  app: FastifyInstance,
  opts: { manager: RoomManager },
): Promise<void> {
  const { store, jwt, config } = app
  const { manager } = opts

  app.post('/api/games', async (request, reply) => {
    const body = createGameSchema.parse(request.body)
    let quiz: { id: string | null; title: string; questions: Question[] }
    if (body.quizId) {
      const stored = await store.quizzes.get(body.quizId)
      if (!stored) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
      if (!canReadQuiz(stored, request.user?.id)) throw forbidden()
      quiz = { id: stored.id, title: stored.title, questions: stored.questions }
    } else {
      const inline = sanitizeQuizInput(body.quiz!)
      quiz = { id: null, title: inline.title, questions: inline.questions }
    }
    if (quiz.questions.length === 0)
      throw badRequest('EMPTY_QUIZ', 'A quiz needs at least one question')

    const room = await manager.create({
      quiz,
      settings: body.settings,
      hostId: request.user?.id ?? null,
    })
    const hostToken = await jwt.signHost(room.sessionId)
    await store.gameSessions
      .create({
        id: room.sessionId,
        pin: room.pin,
        quizId: quiz.id,
        hostId: room.hostId,
        mode: room.settings.mode,
        settings: room.settings,
        status: 'lobby',
        startedAt: null,
        endedAt: null,
      })
      .catch((e) => request.log.warn({ err: e }, 'game_sessions insert failed'))
    request.log.info(
      { sessionId: room.sessionId, pin: room.pin, hostId: room.hostId },
      'game created',
    )
    return reply.code(201).send({
      sessionId: room.sessionId,
      pin: room.pin,
      hostToken,
      joinUrl: `${config.WEB_ORIGIN}/join?pin=${room.pin}`,
    })
  })

  app.get<{ Params: { pin: string } }>(
    '/api/games/pin/:pin',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const { pin } = request.params
      if (!isValidPin(pin)) return { exists: false }
      const local = manager.getByPin(pin)
      if (local) {
        return {
          exists: true,
          status: local.status as GameStatus,
          quizTitle: local.quizTitle,
          mode: local.settings.mode as GameMode,
        }
      }
      const sessionId = await manager.sessionIdForPin(pin)
      if (!sessionId) return { exists: false }
      const meta = await manager.remoteMeta(sessionId)
      if (!meta) return { exists: false }
      return {
        exists: true,
        status: meta.status as GameStatus,
        quizTitle: meta.quizTitle,
        mode: meta.mode as GameMode,
      }
    },
  )

  /** Host authorization: `x-host-token` header for this session, or the session cookie of the host. */
  async function authorizeHost(
    request: FastifyRequest,
    sessionId: string,
    hostId: string | null,
  ): Promise<void> {
    const header = request.headers['x-host-token']
    const token = Array.isArray(header) ? header[0] : header
    if (token) {
      const claims = await jwt.verifyHost(token)
      if (claims && claims.sessionId === sessionId) return
    }
    if (request.user && hostId && request.user.id === hostId) return
    throw token || request.user ? forbidden() : unauthorized()
  }

  async function loadResult(request: FastifyRequest, sessionId: string): Promise<GameResult> {
    const room = manager.get(sessionId)
    if (room) {
      await authorizeHost(request, sessionId, room.hostId)
      if (room.status !== 'ended') throw notFound('GAME_NOT_ENDED', 'The game has not ended yet')
      return room.buildResult()
    }
    const stored = await store.gameResults.getBySessionId(sessionId)
    if (!stored) throw notFound('GAME_NOT_FOUND', 'Game not found')
    await authorizeHost(request, sessionId, stored.hostId)
    return stored
  }

  app.get<{ Params: { sessionId: string } }>('/api/games/:sessionId/result', async (request) => {
    const result = await loadResult(request, request.params.sessionId)
    return { result }
  })

  app.get<{ Params: { sessionId: string } }>(
    '/api/games/:sessionId/result.csv',
    async (request, reply) => {
      const result = await loadResult(request, request.params.sessionId)
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="kontext-quiz-${result.pin}.csv"`)
        .send(resultToCsv(result))
    },
  )

  // Archive results when rooms end. A room the host closed is discarded:
  // the session is marked ended but no result is written.
  manager.onEnded((room) => {
    const work =
      room.endReason === 'cancelled'
        ? store.gameSessions
            .update(room.sessionId, { status: 'ended', endedAt: new Date() })
            .then(() => undefined)
        : persistRoomResult(store, room).then(() => undefined)
    void work.catch((e) =>
      app.log.error({ err: e, sessionId: room.sessionId }, 'failed to persist game result'),
    )
  })
}
