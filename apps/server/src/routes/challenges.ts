import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  GRACE_MS,
  computeScore,
  createChallengeSchema,
  dedupeNickname,
  evaluateAnswer,
  generateCode,
  rankPlayers,
  validateNickname,
  type AnswerResult,
  type LeaderboardEntry,
  type PublicQuestion,
  type Question,
  type Quiz,
} from '@kontext/shared'
import {
  badRequest,
  conflict,
  forbidden,
  noDatabase,
  notFound,
  unauthorized,
  HttpError,
} from '../errors.js'
import { toChallenge, type ChallengeAttemptRecord, type ChallengeRecord } from '../store/types.js'
import { canReadQuiz } from './quizzes.js'

const attemptBody = z.object({ nickname: z.string().max(200) })
const answerBody = z.object({
  questionIndex: z.number().int().min(0),
  optionIds: z.array(z.string().max(40)).max(4).optional(),
  text: z.string().max(200).optional(),
})

/** Challenge mode plays only scorable questions (info slides are skipped). */
export function challengeQuestions(quiz: Quiz): Question[] {
  return quiz.questions.filter((q) => q.type !== 'info')
}

function streakOf(answers: ChallengeAttemptRecord['answers']): number {
  let streak = 0
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i]?.correct) streak++
    else break
  }
  return streak
}

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  const { store, jwt, config } = app
  const auth = { preHandler: app.requireAuth }

  async function loadChallenge(code: string): Promise<{ challenge: ChallengeRecord; quiz: Quiz }> {
    const challenge = await store.challenges.getByCode(code)
    if (!challenge) throw notFound('CHALLENGE_NOT_FOUND', 'Challenge not found')
    const quiz = await store.quizzes.get(challenge.quizId)
    if (!quiz) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    return { challenge, quiz }
  }

  async function loadAttempt(
    request: FastifyRequest,
    challenge: ChallengeRecord,
    attemptId: string,
  ): Promise<ChallengeAttemptRecord> {
    const header = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw unauthorized('INVALID_TOKEN', 'Bearer token required')
    const claims = await jwt.verifyAttempt(token)
    if (!claims || claims.challengeId !== challenge.id || claims.attemptId !== attemptId) {
      throw forbidden('INVALID_TOKEN', 'Token does not match this attempt')
    }
    const attempt = await store.challenges.getAttempt(attemptId)
    if (!attempt || attempt.challengeId !== challenge.id) throw notFound('ATTEMPT_NOT_FOUND')
    return attempt
  }

  function rankOf(attempts: ChallengeAttemptRecord[], attemptId: string): number {
    const ranked = rankPlayers(
      attempts.map((a) => ({ id: a.id, nickname: a.nickname, score: a.score })),
    )
    return ranked.find((r) => r.id === attemptId)?.rank ?? ranked.length + 1
  }

  app.post('/api/challenges', auth, async (request, reply) => {
    if (store.kind === 'memory' && !config.isTest) throw noDatabase()
    const body = createChallengeSchema.parse(request.body)
    const quiz = await store.quizzes.get(body.quizId)
    if (!quiz) throw notFound('QUIZ_NOT_FOUND', 'Quiz not found')
    if (!canReadQuiz(quiz, request.user!.id)) throw forbidden()
    if (challengeQuestions(quiz).length === 0)
      throw badRequest('EMPTY_QUIZ', 'Quiz has no scorable questions')
    const deadline = new Date(body.deadline)
    if (deadline.getTime() <= Date.now())
      throw badRequest('INVALID_DEADLINE', 'Deadline must be in the future')
    let code = generateCode()
    for (let i = 0; i < 10 && (await store.challenges.getByCode(code)); i++) code = generateCode()
    const record: ChallengeRecord = {
      id: randomUUID(),
      code,
      quizId: quiz.id,
      hostId: request.user!.id,
      deadline,
      createdAt: new Date(),
    }
    await store.challenges.create(record)
    return reply.code(201).send({
      challenge: toChallenge(record, quiz.title, 0),
      url: `${config.WEB_ORIGIN}/challenge/${code}`,
    })
  })

  app.get('/api/challenges', auth, async (request) => {
    if (store.kind === 'memory' && !config.isTest) throw noDatabase()
    const records = await store.challenges.listByHost(request.user!.id)
    const challenges = await Promise.all(
      records.map(async (r) => {
        const [quiz, count] = await Promise.all([
          store.quizzes.get(r.quizId),
          store.challenges.countAttempts(r.id),
        ])
        return toChallenge(r, quiz?.title ?? '(deleted quiz)', count)
      }),
    )
    return { challenges }
  })

  app.get<{ Params: { code: string } }>('/api/challenges/:code', async (request) => {
    const { challenge, quiz } = await loadChallenge(request.params.code)
    const count = await store.challenges.countAttempts(challenge.id)
    return {
      challenge: toChallenge(challenge, quiz.title, count),
      questionCount: challengeQuestions(quiz).length,
      expired: challenge.deadline.getTime() < Date.now(),
    }
  })

  app.post<{ Params: { code: string } }>(
    '/api/challenges/:code/attempts',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { challenge } = await loadChallenge(request.params.code)
      if (challenge.deadline.getTime() < Date.now())
        throw new HttpError(410, 'CHALLENGE_EXPIRED', 'Challenge expired')
      const body = attemptBody.parse(request.body)
      const v = validateNickname(body.nickname)
      if (!v.ok) throw badRequest(v.error, 'Invalid nickname')
      const existing = await store.challenges.listAttempts(challenge.id)
      const nickname = dedupeNickname(
        v.nickname,
        existing.map((a) => a.nickname),
      )
      const attempt: ChallengeAttemptRecord = {
        id: randomUUID(),
        challengeId: challenge.id,
        nickname,
        score: 0,
        currentQuestionIndex: 0,
        finished: false,
        startedAt: new Date(),
        questionStartedAt: {},
        answers: [],
      }
      await store.challenges.createAttempt(attempt)
      const token = await jwt.signAttempt(challenge.id, attempt.id)
      return reply.code(201).send({ attemptId: attempt.id, token, nickname })
    },
  )

  app.get<{ Params: { code: string; attemptId: string } }>(
    '/api/challenges/:code/attempts/:attemptId/question',
    async (request) => {
      const { challenge, quiz } = await loadChallenge(request.params.code)
      const attempt = await loadAttempt(request, challenge, request.params.attemptId)
      const questions = challengeQuestions(quiz)
      const idx = attempt.currentQuestionIndex
      const q = questions[idx]
      if (attempt.finished || !q) {
        if (!attempt.finished) {
          attempt.finished = true
          await store.challenges.updateAttempt(attempt)
        }
        const all = await store.challenges.listAttempts(challenge.id)
        return {
          finished: true,
          score: attempt.score,
          rank: rankOf(
            all.filter((a) => a.finished),
            attempt.id,
          ),
        }
      }
      const now = Date.now()
      let startedAt = attempt.questionStartedAt[String(idx)]
      if (startedAt === undefined) {
        startedAt = now
        attempt.questionStartedAt[String(idx)] = now
        await store.challenges.updateAttempt(attempt)
      }
      const question: PublicQuestion = {
        id: q.id,
        index: idx,
        total: questions.length,
        type: q.type,
        text: q.text,
        mediaUrl: q.mediaUrl ?? null,
        options:
          q.type === 'text' ? [] : q.options.map((o, i) => ({ id: o.id, text: o.text, index: i })),
        timeLimit: q.timeLimit,
        pointsMultiplier: q.pointsMultiplier,
      }
      return {
        question,
        serverTime: now,
        startedAt,
        deadline: startedAt + q.timeLimit * 1000,
        finished: false,
      }
    },
  )

  app.post<{ Params: { code: string; attemptId: string } }>(
    '/api/challenges/:code/attempts/:attemptId/answer',
    async (request) => {
      const { challenge, quiz } = await loadChallenge(request.params.code)
      const attempt = await loadAttempt(request, challenge, request.params.attemptId)
      const body = answerBody.parse(request.body)
      const questions = challengeQuestions(quiz)
      const idx = attempt.currentQuestionIndex
      if (attempt.answers.some((a) => a.questionIndex === body.questionIndex)) {
        throw conflict('ALREADY_ANSWERED', 'Question already answered')
      }
      const q = questions[idx]
      if (attempt.finished || !q) throw badRequest('NOT_IN_QUESTION', 'Attempt is finished')
      if (body.questionIndex !== idx)
        throw badRequest('NOT_IN_QUESTION', `Current question is ${idx}`)
      const startedAt = attempt.questionStartedAt[String(idx)]
      if (startedAt === undefined) throw badRequest('NOT_IN_QUESTION', 'Question not started')

      const now = Date.now()
      const deadline = startedAt + q.timeLimit * 1000
      const late = now > deadline + GRACE_MS
      const answerTimeMs = Math.max(0, now - startedAt)
      const optionIds = body.optionIds ?? []
      const text = q.type === 'text' ? (body.text ?? '').trim() || null : null
      const fraction = late
        ? 0
        : evaluateAnswer(q, q.type === 'text' ? { text: text ?? '' } : { optionIds })
      const scored = computeScore({
        fraction,
        answerTimeMs,
        timeLimitSec: q.timeLimit,
        multiplier: q.pointsMultiplier,
        streakBefore: streakOf(attempt.answers),
      })
      attempt.answers.push({
        questionIndex: idx,
        optionIds,
        text,
        correct: scored.correct,
        fraction,
        points: scored.points,
        answerTimeMs,
        late,
      })
      attempt.score += scored.points
      attempt.currentQuestionIndex = idx + 1
      attempt.finished = idx + 1 >= questions.length
      await store.challenges.updateAttempt(attempt)

      const all = await store.challenges.listAttempts(challenge.id)
      const result: AnswerResult = {
        questionIndex: idx,
        answered: true,
        correct: scored.correct,
        fraction,
        points: scored.points,
        streak: scored.streakAfter,
        score: attempt.score,
        rank: rankOf(all, attempt.id),
        answerTimeMs,
      }
      return {
        result,
        correctOptionIds:
          q.type === 'text' ? [] : q.options.filter((o) => o.isCorrect).map((o) => o.id),
        acceptedAnswers: q.type === 'text' ? q.options.map((o) => o.text) : [],
        finished: attempt.finished,
        late,
      }
    },
  )

  app.get<{ Params: { code: string } }>('/api/challenges/:code/leaderboard', async (request) => {
    const { challenge } = await loadChallenge(request.params.code)
    const attempts = (await store.challenges.listAttempts(challenge.id)).filter((a) => a.finished)
    const ranked = rankPlayers(
      attempts.map((a) => ({ id: a.id, nickname: a.nickname, score: a.score })),
    )
    const entries: LeaderboardEntry[] = ranked.map((r) => ({
      playerId: r.id,
      nickname: r.nickname,
      avatar: null,
      score: r.score,
      streak: 0,
      rank: r.rank,
      previousRank: null,
    }))
    return { entries }
  })
}
