import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const query = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/library', async (request) => {
    const { q, page, limit } = query.parse(request.query)
    const { quizzes, total } = await app.store.quizzes.listPublic({ q, page, limit })
    return { quizzes, total, page, limit }
  })
}
