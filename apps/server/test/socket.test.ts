import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  Ack,
  AnswerAck,
  GameResult,
  GameSnapshot,
  JoinResult,
  TimePingResult,
} from '@kontext/shared'
import {
  connectSocket,
  emitAck,
  json,
  nextEvent,
  startTestServer,
  waitForState,
  type ClientSocket,
  type TestServer,
} from './helpers/server.js'
import { shortQuizInput } from './helpers/quiz.js'
import { testConfig } from '../src/config.js'

type Snap = GameSnapshot

describe('socket flow (memory mode)', () => {
  let ts: TestServer
  const sockets: ClientSocket[] = []
  const allPlayerSnapshots: Snap[] = []

  beforeAll(async () => {
    ts = await startTestServer()
  })
  afterAll(async () => {
    for (const s of sockets) s.disconnect()
    await ts.close()
  })

  const open = async () => {
    const s = await connectSocket(ts.url)
    sockets.push(s)
    return s
  }

  it('plays a whole game end to end', async () => {
    // 1. host creates a game over HTTP with an inline quiz
    const created = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quiz: shortQuizInput(),
        settings: { showQuestionOnPlayer: true, endWhenAllAnswered: false },
      }),
    })
    expect(created.status).toBe(201)
    const game = await json<{ sessionId: string; pin: string; hostToken: string; joinUrl: string }>(
      created,
    )
    expect(game.pin).toMatch(/^\d{6}$/)
    expect(game.joinUrl).toContain(`/join?pin=${game.pin}`)

    const pinInfo = await json<{ exists: boolean; status: string }>(
      await fetch(`${ts.url}/api/games/pin/${game.pin}`),
    )
    expect(pinInfo).toMatchObject({
      exists: true,
      status: 'lobby',
      quizTitle: 'Socket test quiz',
      mode: 'live',
    })

    // 2. time:ping works without auth
    const anon = await open()
    const t0 = Date.now()
    const ping = await emitAck<TimePingResult>(anon, 'time:ping', { t0 })
    expect(ping.t0).toBe(t0)
    expect(Math.abs(ping.serverTime - Date.now())).toBeLessThan(1000)

    // 3. host joins
    const host = await open()
    const hj = await emitAck<Ack<{ snapshot: Snap }>>(host, 'host:join', {
      hostToken: game.hostToken,
    })
    expect(hj.ok).toBe(true)
    if (!hj.ok) throw new Error('host join failed')
    expect(hj.snapshot.status).toBe('lobby')
    expect(await emitAck<Ack>(anon, 'host:start')).toEqual({
      ok: false,
      error: { code: 'NOT_HOST' },
    })

    // 4. three players join
    const players: { socket: ClientSocket; join: JoinResult }[] = []
    for (const nick of ['Ann', 'Bob', 'Cid']) {
      const s = await open()
      s.on('state', (snap) => allPlayerSnapshots.push(snap))
      const lobbyState = waitForState<Snap>(host, (x) => x.players.some((p) => p.nickname === nick))
      const r = await emitAck<Ack<JoinResult>>(s, 'player:join', { pin: game.pin, nickname: nick })
      expect(r.ok).toBe(true)
      if (!r.ok) throw new Error('join failed')
      expect(r.nickname).toBe(nick)
      expect(r.sessionId).toBe(game.sessionId)
      players.push({ socket: s, join: r })
      await lobbyState
    }
    const bad = await emitAck<Ack<JoinResult>>(anon, 'player:join', {
      pin: '000000',
      nickname: 'X',
    })
    expect(bad).toEqual({ ok: false, error: { code: 'GAME_NOT_FOUND' } })
    const badNick = await emitAck<Ack<JoinResult>>(anon, 'player:join', {
      pin: game.pin,
      nickname: '',
    })
    expect(badNick.ok).toBe(false)

    // 5. start → get_ready → question (host skips the countdown with next)
    const [ann, bob, cid] = players as [
      (typeof players)[0],
      (typeof players)[0],
      (typeof players)[0],
    ]
    const getReady = waitForState<Snap>(ann.socket, (x) => x.status === 'get_ready')
    expect(await emitAck<Ack>(host, 'host:start')).toEqual({ ok: true })
    const gr = await getReady
    expect(gr.questionIndex).toBe(0)
    expect(gr.me?.nickname).toBe('Ann')

    const questionState = waitForState<Snap>(ann.socket, (x) => x.status === 'question')
    expect(await emitAck<Ack>(host, 'host:next')).toEqual({ ok: true })
    const q = await questionState
    expect(q.question?.type).toBe('single')
    expect(q.question?.text).toBe('Pick B') // showQuestionOnPlayer = true
    expect(q.deadline).toBeGreaterThan(q.serverTime)
    expect(q.question?.options.map((o) => o.index)).toEqual([0, 1, 2])

    // 6. answers are acked; host gets answer:count
    const countP = nextEvent<{ answeredCount: number; totalPlayers: number }>(host, 'answer:count')
    const a1 = await emitAck<Ack<AnswerAck>>(ann.socket, 'player:answer', {
      questionIndex: 0,
      optionIds: ['s1b'],
    })
    expect(a1.ok).toBe(true)
    if (a1.ok) expect(typeof a1.receivedAt).toBe('number')
    expect(await countP).toEqual({ answeredCount: 1, totalPlayers: 3 })
    expect(
      await emitAck<Ack<AnswerAck>>(ann.socket, 'player:answer', {
        questionIndex: 0,
        optionIds: ['s1b'],
      }),
    ).toEqual({
      ok: false,
      error: { code: 'ALREADY_ANSWERED' },
    })
    expect(
      (
        await emitAck<Ack<AnswerAck>>(bob.socket, 'player:answer', {
          questionIndex: 0,
          optionIds: ['s1a'],
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await emitAck<Ack<AnswerAck>>(cid.socket, 'player:answer', {
          questionIndex: 0,
          optionIds: ['s1b'],
        })
      ).ok,
    ).toBe(true)
    expect(
      await emitAck<Ack<AnswerAck>>(anon, 'player:answer', {
        questionIndex: 0,
        optionIds: ['s1b'],
      }),
    ).toMatchObject({ ok: false })

    // 7. reveal carries me.lastResult
    const revealP = waitForState<Snap>(ann.socket, (x) => x.status === 'reveal')
    const hostRevealP = waitForState<Snap>(host, (x) => x.status === 'reveal')
    expect(await emitAck<Ack>(host, 'host:next')).toEqual({ ok: true })
    const reveal = await revealP
    expect(reveal.me?.lastResult).toMatchObject({ questionIndex: 0, correct: true, rank: 1 })
    expect(reveal.me?.lastResult?.points).toBeGreaterThanOrEqual(500)
    expect(reveal.reveal?.correctOptionIds).toEqual(['s1b'])
    expect(reveal.reveal?.answeredCount).toBe(3)
    const hostReveal = await hostRevealP
    expect(hostReveal.finalRanking?.length).toBe(3)
    expect(hostReveal.me).toBeUndefined()

    // 8. refresh: disconnect + new socket + player:resume keeps the score
    const scoreBefore = reveal.me!.score
    ann.socket.disconnect()
    await waitForState<Snap>(host, (x) =>
      x.players.some((p) => p.nickname === 'Ann' && !p.connected),
    )
    const ann2 = await open()
    ann2.on('state', (snap) => allPlayerSnapshots.push(snap))
    const resumed = await emitAck<Ack<{ snapshot: Snap }>>(ann2, 'player:resume', {
      token: ann.join.token,
    })
    expect(resumed.ok).toBe(true)
    if (!resumed.ok) throw new Error('resume failed')
    expect(resumed.snapshot.me?.score).toBe(scoreBefore)
    expect(resumed.snapshot.me?.id).toBe(ann.join.playerId)
    expect(resumed.snapshot.status).toBe('reveal')
    expect(await emitAck<Ack>(ann2, 'player:resume', { token: 'garbage' })).toEqual({
      ok: false,
      error: { code: 'INVALID_TOKEN' },
    })

    // 9. kick Cid
    const kickedP = nextEvent<void>(cid.socket, 'kicked')
    expect(await emitAck<Ack>(host, 'host:kick', { playerId: cid.join.playerId })).toEqual({
      ok: true,
    })
    await kickedP
    const rejoin = await emitAck<Ack<JoinResult>>(cid.socket, 'player:resume', {
      token: cid.join.token,
    })
    expect(rejoin).toEqual({ ok: false, error: { code: 'KICKED' } })

    // 10. run the remaining questions with host:next
    const next = () => emitAck<Ack>(host, 'host:next')
    await next() // leaderboard
    for (let qi = 1; qi <= 2; qi++) {
      await next() // get_ready
      const qs = waitForState<Snap>(ann2, (x) => x.status === 'question' && x.questionIndex === qi)
      await next() // question
      const snap = await qs
      const payload =
        snap.question?.type === 'text'
          ? { questionIndex: qi, text: 'YES' }
          : { questionIndex: qi, optionIds: ['s2a'] }
      expect((await emitAck<Ack<AnswerAck>>(ann2, 'player:answer', payload)).ok).toBe(true)
      await next() // reveal
      await next() // leaderboard
    }
    const podiumP = waitForState<Snap>(ann2, (x) => x.status === 'podium')
    await next()
    const podium = await podiumP
    expect(podium.finalRanking?.[0]?.nickname).toBe('Ann')
    expect(podium.me?.rank).toBe(1)

    // result is 404 until ended
    const early = await fetch(`${ts.url}/api/games/${game.sessionId}/result`, {
      headers: { 'x-host-token': game.hostToken },
    })
    expect(early.status).toBe(404)

    const endedP = waitForState<Snap>(host, (x) => x.status === 'ended')
    await next()
    await endedP

    // 11. result + CSV
    const unauthorized = await fetch(`${ts.url}/api/games/${game.sessionId}/result`)
    expect(unauthorized.status).toBe(401)
    const res = await fetch(`${ts.url}/api/games/${game.sessionId}/result`, {
      headers: { 'x-host-token': game.hostToken },
    })
    expect(res.status).toBe(200)
    const { result } = await json<{ result: GameResult }>(res)
    expect(result.sessionId).toBe(game.sessionId)
    expect(result.playerCount).toBe(2)
    expect(result.players[0]?.nickname).toBe('Ann')
    expect(result.players[0]?.correctCount).toBe(3)
    expect(result.questions.length).toBe(3)
    const csvRes = await fetch(`${ts.url}/api/games/${game.sessionId}/result.csv`, {
      headers: { 'x-host-token': game.hostToken },
    })
    expect(csvRes.status).toBe(200)
    expect(csvRes.headers.get('content-type')).toContain('text/csv')
    const raw = Buffer.from(await csvRes.arrayBuffer())
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 BOM (Response.text() would strip it)
    const csv = raw.toString('utf8')
    expect(csv).toContain(
      'rank,nickname,score,correct,total,q1,q2,q3,q1_time_ms,q2_time_ms,q3_time_ms',
    )
    expect(csv).toContain('1,Ann,')

    // also archived through the store
    await new Promise((r) => setTimeout(r, 20))
    expect((await ts.store.gameResults.getBySessionId(game.sessionId))?.id).toBe(result.id)

    // 12. players never saw correctness before reveal
    expect(allPlayerSnapshots.length).toBeGreaterThan(5)
    for (const snap of allPlayerSnapshots) {
      expect(JSON.stringify(snap)).not.toContain('isCorrect')
      if (snap.status !== 'reveal' && snap.status !== 'leaderboard') expect(snap.reveal).toBeNull()
    }

    // metrics
    const metrics = await json<{ activeRooms: number; connections: number }>(
      await fetch(`${ts.url}/metrics`),
    )
    expect(metrics.activeRooms).toBe(0)
    expect(metrics.connections).toBeGreaterThan(0)
    const prom = await (
      await fetch(`${ts.url}/metrics`, { headers: { accept: 'text/plain' } })
    ).text()
    expect(prom).toContain('kq_active_rooms')
  })
})

describe('PIN brute-force protection', () => {
  let ts: TestServer
  const sockets: ClientSocket[] = []

  beforeAll(async () => {
    ts = await startTestServer()
  })
  afterAll(async () => {
    for (const s of sockets) s.disconnect()
    await ts.close()
  })

  it('limits failed PIN guesses per IP but keeps valid joins working', async () => {
    const s = await connectSocket(ts.url)
    sockets.push(s)
    const limit = testConfig().PIN_GUESS_LIMIT_PER_MIN
    for (let i = 0; i < limit; i++) {
      const r = await emitAck<Ack<JoinResult>>(s, 'player:join', {
        pin: '999999',
        nickname: `g${i}`,
      })
      expect(r).toMatchObject({ ok: false, error: { code: 'GAME_NOT_FOUND' } })
    }
    const blocked = await emitAck<Ack<JoinResult>>(s, 'player:join', {
      pin: '999998',
      nickname: 'x',
    })
    expect(blocked).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } })

    // A real game is still joinable from the same IP (flood limit is much higher).
    const created = await fetch(`${ts.url}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quiz: shortQuizInput() }),
    })
    const game = await json<{ pin: string }>(created)
    const ok = await emitAck<Ack<JoinResult>>(s, 'player:join', { pin: game.pin, nickname: 'Оля' })
    expect(ok.ok).toBe(true)
  })
})
