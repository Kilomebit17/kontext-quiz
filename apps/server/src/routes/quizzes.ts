import type { FastifyInstance } from 'fastify'
import { quizInputSchema, type Quiz } from '@kontext/shared'
import { forbidden, noDatabase, notFound } from '../errors.js'
import { sanitizeQuizInput } from '../sanitize.js'

export function canReadQuiz(quiz: Quiz, userId: string | null | undefined): boolean {
  if (quiz.visibility === 'public' || quiz.visibility === 'link') return true
  return Boolean(userId) && quiz.ownerId === userId
}

export async function quizRoutes(app: FastifyInstance): Promise<void> {
  const { store } = app
  const requireDb = () => {
    if (store.kind === 'memory') throw noDatabase()
  }
  const auth = { preHandler: app.requireAuth }

  app.get('/api/quizzes', auth, async (request) => {
    requireDb()
    const user = request.user!
    return { quizzes: await store.quizzes.listByOwner(user.id) }
  })

  app.post('/api/quizzes', auth, async (request, reply) => {
    requireDb()
    const input = sanitizeQuizInput(quizInputSchema.parse(request.body))
    const quiz = await store.quizzes.create(request.user!.id, input)
    return reply.code(201).send({ quiz })
  })

  app.get<{ Params: { id: string } }>('/api/quizzes/:id', async (request) => {
    const quiz = await store.quizzes.get(request.params.id)
    if (!quiz) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    if (!canReadQuiz(quiz, request.user?.id)) {
      if (!request.user) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
      throw forbidden()
    }
    return { quiz }
  })

  app.put<{ Params: { id: string } }>('/api/quizzes/:id', auth, async (request) => {
    requireDb()
    const existing = await store.quizzes.get(request.params.id)
    if (!existing) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    if (existing.ownerId !== request.user!.id) throw forbidden()
    const input = sanitizeQuizInput(quizInputSchema.parse(request.body))
    const quiz = await store.quizzes.update(existing.id, input)
    if (!quiz) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    return { quiz }
  })

  app.delete<{ Params: { id: string } }>('/api/quizzes/:id', auth, async (request) => {
    requireDb()
    const existing = await store.quizzes.get(request.params.id)
    if (!existing) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    if (existing.ownerId !== request.user!.id) throw forbidden()
    await store.quizzes.delete(existing.id)
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>(
    '/api/quizzes/:id/duplicate',
    auth,
    async (request, reply) => {
      requireDb()
      const source = await store.quizzes.get(request.params.id)
      if (!source) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
      if (!canReadQuiz(source, request.user!.id)) throw forbidden()
      const quiz = await store.quizzes.create(request.user!.id, {
        title: source.title,
        coverUrl: source.coverUrl ?? null,
        visibility: 'private',
        questions: source.questions,
      })
      return reply.code(201).send({ quiz })
    },
  )
}
