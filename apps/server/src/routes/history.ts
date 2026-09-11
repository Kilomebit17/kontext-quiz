import type { FastifyInstance } from 'fastify'
import { notFound } from '../errors.js'
import { resultToCsv } from '../game/csv.js'

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  const { store } = app
  const auth = { preHandler: app.requireAuth }

  app.get('/api/history', auth, async (request) => {
    return { games: await store.gameResults.listByHost(request.user!.id) }
  })

  const load = async (id: string, hostId: string) => {
    const result = await store.gameResults.get(id)
    if (!result || result.hostId !== hostId) throw notFound('GAME_NOT_FOUND', 'Game not found')
    return result
  }

  app.get<{ Params: { id: string } }>('/api/history/:id', auth, async (request) => ({
    result: await load(request.params.id, request.user!.id),
  }))

  app.get<{ Params: { id: string } }>('/api/history/:id/csv', auth, async (request, reply) => {
    const result = await load(request.params.id, request.user!.id)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="kontext-quiz-${result.pin}.csv"`)
      .send(resultToCsv(result))
  })

  app.delete<{ Params: { id: string } }>('/api/history/:id', auth, async (request) => {
    const ok = await store.gameResults.delete(request.params.id, request.user!.id)
    if (!ok) throw notFound('GAME_NOT_FOUND', 'Game not found')
    return { ok: true }
  })
}
