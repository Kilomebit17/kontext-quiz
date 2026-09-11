import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AVATAR_ANIMALS,
  type AnswerResult,
  type LeaderboardEntry,
  type PublicQuestion,
  type QuizSummary,
} from '@kontext/shared'
import { DEMO_QUIZZES } from '../src/db/demoQuizzes.js'
import { json, startTestServer, type TestServer } from './helpers/server.js'

describe('HTTP (memory mode)', () => {
  let ts: TestServer
  beforeAll(async () => {
    ts = await startTestServer()
  })
  afterAll(async () => {
    await ts.close()
  })

  it('serves health', async () => {
    const res = await json<{ ok: boolean; instanceId: string; uptime: number }>(
      await fetch(`${ts.url}/healthz`),
    )
    expect(res.ok).toBe(true)
    expect(typeof res.instanceId).toBe('string')
  })

  it('library lists the demo quizzes', async () => {
    const res = await json<{ quizzes: QuizSummary[]; total: number; page: number; limit: number }>(
      await fetch(`${ts.url}/api/library`),
    )
    expect(res.total).toBe(2)
    expect(res.quizzes.map((q) => q.title).sort()).toEqual([
      'World capitals',
      'Україна: швидкий тест',
    ])
    expect(res.quizzes.every((q) => q.visibility === 'public' && q.questionCount > 0)).toBe(true)
    const filtered = await json<{ quizzes: QuizSummary[] }>(
      await fetch(`${ts.url}/api/library?q=capitals`),
    )
    expect(filtered.quizzes.length).toBe(1)
    // full quiz readable without auth because it is public
    const one = await fetch(`${ts.url}/api/quizzes/${DEMO_QUIZZES[1]!.id}`)
    expect(one.status).toBe(200)
  })

  it('auth routes report NO_DATABASE, quiz routes need auth', async () => {
    const ml = await fetch(`${ts.url}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co' }),
    })
    expect(ml.status).toBe(503)
    expect((await json<{ error: { code: string } }>(ml)).error.code).toBe('NO_DATABASE')
    const me = await json<{ user: null }>(await fetch(`${ts.url}/api/auth/me`))
    expect(me.user).toBeNull()
    expect((await fetch(`${ts.url}/api/quizzes`)).status).toBe(401)
    expect((await fetch(`${ts.url}/api/history`)).status).toBe(401)
    expect((await fetch(`${ts.url}/api/auth/google`)).status).toBe(404)
    const verify = await fetch(`${ts.url}/api/auth/magic-link/verify?token=x`, {
      redirect: 'manual',
    })
    expect(verify.status).toBe(302)
    expect(verify.headers.get('location')).toContain('/login?error=invalid_link')
  })

  it('validates game creation', async () => {
    const res = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { mode: 'live' } }),
    })
    expect(res.status).toBe(400)
    const body = await json<{ error: { code: string; message: string } }>(res)
    expect(body.error.code).toBe('VALIDATION_ERROR')

    const both = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quizId: DEMO_QUIZZES[0]!.id, quiz: { title: 'x', questions: [] } }),
    })
    expect(both.status).toBe(400)

    const badQuestion = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quiz: {
          title: 'x',
          questions: [
            {
              id: 'a',
              type: 'single',
              text: 'q',
              options: [{ id: '1', text: 'a', isCorrect: false }],
              timeLimit: 7,
              pointsMultiplier: 1,
            },
          ],
        },
      }),
    })
    expect(badQuestion.status).toBe(400)

    // from a library quiz (guest host)
    const ok = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quizId: DEMO_QUIZZES[0]!.id, settings: { shuffleQuestions: true } }),
    })
    expect(ok.status).toBe(201)
    const game = await json<{ pin: string; sessionId: string; hostToken: string }>(ok)
    const info = await json<{ exists: boolean; quizTitle: string }>(
      await fetch(`${ts.url}/api/games/pin/${game.pin}`),
    )
    expect(info).toMatchObject({ exists: true, quizTitle: 'Україна: швидкий тест' })
    expect(
      (
        await fetch(`${ts.url}/api/games/${game.sessionId}/result`, {
          headers: { 'x-host-token': 'nope' },
        })
      ).status,
    ).toBe(403)
  })

  it('unknown pin → exists false; unknown route → 404 JSON', async () => {
    expect(await json(await fetch(`${ts.url}/api/games/pin/000000`))).toEqual({ exists: false })
    expect(await json(await fetch(`${ts.url}/api/games/pin/abc`))).toEqual({ exists: false })
    const nf = await fetch(`${ts.url}/api/nope`)
    expect(nf.status).toBe(404)
    expect((await json<{ error: { code: string } }>(nf)).error.code).toBe('NOT_FOUND')
  })

  it('runs a challenge end to end', async () => {
    const quiz = DEMO_QUIZZES[1]!
    const code = 'testcode'
    await ts.store.challenges.create({
      id: randomUUID(),
      code,
      quizId: quiz.id,
      hostId: null,
      deadline: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    })

    const meta = await json<{
      challenge: { code: string; quizTitle: string }
      questionCount: number
      expired: boolean
    }>(await fetch(`${ts.url}/api/challenges/${code}`))
    expect(meta.challenge.quizTitle).toBe('World capitals')
    expect(meta.questionCount).toBe(5)
    expect(meta.expired).toBe(false)
    expect((await fetch(`${ts.url}/api/challenges/nope`)).status).toBe(404)

    const attemptRes = await fetch(`${ts.url}/api/challenges/${code}/attempts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'Solo' }),
    })
    expect(attemptRes.status).toBe(201)
    const attempt = await json<{ attemptId: string; token: string; nickname: string }>(attemptRes)
    expect(attempt.nickname).toBe('Solo')
    const auth = { authorization: `Bearer ${attempt.token}` }
    const base = `${ts.url}/api/challenges/${code}/attempts/${attempt.attemptId}`

    expect((await fetch(`${base}/question`)).status).toBe(401)

    const answersByQuestion: Record<string, { optionIds?: string[]; text?: string }> = {
      'wc-1': { optionIds: ['wc-1-b'] },
      'wc-2': { optionIds: ['wc-2-a'] }, // wrong on purpose
      'wc-3': { optionIds: ['wc-3-a'] },
      'wc-4': { text: 'tokyo' },
      'wc-5': { optionIds: ['wc-5-a', 'wc-5-c'] },
    }
    let finished = false
    let idx = 0
    let lastScore = 0
    while (!finished) {
      const q = await json<
        | {
            finished: false
            question: PublicQuestion
            serverTime: number
            startedAt: number
            deadline: number
          }
        | { finished: true }
      >(await fetch(`${base}/question`, { headers: auth }))
      if (q.finished) break
      expect(q.question.index).toBe(idx)
      expect(q.question.text).toBeTruthy()
      expect(JSON.stringify(q)).not.toContain('isCorrect')
      expect(q.deadline).toBe(q.startedAt + q.question.timeLimit * 1000)
      // second GET does not restart the timer
      const again = await json<{ startedAt: number }>(
        await fetch(`${base}/question`, { headers: auth }),
      )
      expect(again.startedAt).toBe(q.startedAt)

      const ans = await fetch(`${base}/answer`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ questionIndex: idx, ...answersByQuestion[q.question.id] }),
      })
      expect(ans.status).toBe(200)
      const body = await json<{
        result: AnswerResult
        correctOptionIds: string[]
        acceptedAnswers: string[]
        finished: boolean
      }>(ans)
      expect(body.result.questionIndex).toBe(idx)
      expect(body.result.correct).toBe(q.question.id !== 'wc-2')
      expect(body.result.score).toBeGreaterThanOrEqual(lastScore)
      lastScore = body.result.score
      if (q.question.type === 'text') expect(body.acceptedAnswers).toContain('Tokyo')
      else expect(body.correctOptionIds.length).toBeGreaterThan(0)

      const dup = await fetch(`${base}/answer`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ questionIndex: idx, optionIds: ['x'] }),
      })
      expect(dup.status).toBe(409)
      finished = body.finished
      idx++
    }
    expect(idx).toBe(5)
    const done = await json<{ finished: true; score: number; rank: number }>(
      await fetch(`${base}/question`, { headers: auth }),
    )
    expect(done).toMatchObject({ finished: true, score: lastScore, rank: 1 })
    expect(lastScore).toBeGreaterThan(0)

    const lb = await json<{ entries: LeaderboardEntry[] }>(
      await fetch(`${ts.url}/api/challenges/${code}/leaderboard`),
    )
    expect(lb.entries).toEqual([
      {
        playerId: attempt.attemptId,
        nickname: 'Solo',
        avatar: null,
        score: lastScore,
        streak: 0,
        rank: 1,
        previousRank: null,
      },
    ])

    // nickname dedupe + profanity
    const dupe = await json<{ nickname: string }>(
      await fetch(`${ts.url}/api/challenges/${code}/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: 'solo' }),
      }),
    )
    expect(dupe.nickname).toBe('solo 2')
    const profane = await fetch(`${ts.url}/api/challenges/${code}/attempts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'shit' }),
    })
    expect(profane.status).toBe(400)
    expect((await json<{ error: { code: string } }>(profane)).error.code).toBe('NICKNAME_PROFANE')

    // creating a challenge over HTTP requires auth
    expect(
      (
        await fetch(`${ts.url}/api/challenges`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401)
  })
})

describe('nickname + password auth (memory mode)', () => {
  let ts: TestServer
  beforeAll(async () => {
    ts = await startTestServer()
  })
  afterAll(async () => {
    await ts.close()
  })

  const post = (body: unknown, cookie?: string) =>
    fetch(`${ts.url}/api/auth/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    })

  it('creates an account on first login, then verifies the password', async () => {
    const created = await post({ nickname: '@Olena_K', password: 'secret123' })
    expect(created.status).toBe(201)
    const body = await json<{ user: { nickname: string; email: string | null }; created: boolean }>(
      created,
    )
    expect(body.created).toBe(true)
    expect(body.user.nickname).toBe('Olena_K')
    expect(body.user.email).toBeNull()
    const cookie = created.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('kq_session=')

    const me = await json<{ user: { nickname: string } | null }>(
      await fetch(`${ts.url}/api/auth/me`, { headers: { cookie: cookie.split(';')[0] ?? '' } }),
    )
    expect(me.user?.nickname).toBe('Olena_K')

    // Same handle, different case → existing account, password checked.
    const again = await post({ nickname: 'olena_k', password: 'secret123' })
    expect(again.status).toBe(200)
    expect((await json<{ created: boolean }>(again)).created).toBe(false)

    const wrong = await post({ nickname: 'olena_k', password: 'nope-nope' })
    expect(wrong.status).toBe(401)
    expect((await json<{ error: { code: string } }>(wrong)).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects malformed handles and short passwords', async () => {
    expect((await post({ nickname: 'has space', password: 'secret123' })).status).toBe(400)
    expect((await post({ nickname: 'ok', password: '123' })).status).toBe(400)
  })

  it('does not let a password log into an email-only account', async () => {
    await ts.store.users.create({ nickname: 'mailonly', name: 'Mail', email: 'm@x.io' })
    const res = await post({ nickname: 'mailonly', password: 'secret123' })
    expect(res.status).toBe(409)
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('PASSWORD_NOT_SET')
  })

  it('lets a signed-in user change their avatar, rejects unknown ids and guests', async () => {
    const created = await post({ nickname: 'picky', password: 'secret123' })
    const cookie = created.headers.get('set-cookie')?.split(';')[0] ?? ''
    const patch = (body: unknown, withCookie = true) =>
      fetch(`${ts.url}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(withCookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })
    const target = `${AVATAR_ANIMALS[1]}-5`
    const ok = await patch({ avatar: target })
    expect(ok.status).toBe(200)
    expect((await json<{ user: { avatar: string } }>(ok)).user.avatar).toBe(target)
    const me = await fetch(`${ts.url}/api/auth/me`, { headers: { cookie } })
    expect((await json<{ user: { avatar: string } }>(me)).user.avatar).toBe(target)
    expect((await patch({ avatar: 'dragon-1' })).status).toBe(400)
    expect((await patch({ avatar: target }, false)).status).toBe(401)
  })
})
