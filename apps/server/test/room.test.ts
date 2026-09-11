import { describe, expect, it } from 'vitest'
import {
  AVATAR_ANIMALS,
  DEFAULT_GAME_SETTINGS,
  parseAvatar,
  DISCUSSION_MS,
  GET_READY_MS,
  GRACE_MS,
  STREAK_BONUS,
  seededRandom,
  shuffle,
  type GameSettings,
  type Question,
} from '@kontext/shared'
import { resultToCsv } from '../src/game/csv.js'
import { GameRoom, type ChangeReason } from '../src/game/room.js'
import { makeClock } from './helpers/clock.js'
import { fourQuestions } from './helpers/quiz.js'

function makeRoom(questions: Question[] = fourQuestions(), settings: Partial<GameSettings> = {}) {
  const clock = makeClock()
  const changes: ChangeReason[] = []
  const counts: number[] = []
  const room = new GameRoom({
    sessionId: 'sess-1',
    pin: '123456',
    quiz: { id: null, title: 'Test', questions },
    // Timer-driven by default so the phase tests below control time explicitly.
    settings: { ...DEFAULT_GAME_SETTINGS, endWhenAllAnswered: false, ...settings },
    hostId: null,
    now: clock.now,
    schedule: clock.schedule,
    onChange: (_r, reason) => changes.push(reason),
    onAnswerCount: (_r, n) => counts.push(n),
  })
  return { room, clock, changes, counts }
}

function join(room: GameRoom, nick: string): string {
  const r = room.addPlayer(nick)
  if (!r.ok) throw new Error(`join failed: ${r.error.code}`)
  return r.playerId
}

/** start → get_ready → question */
function toQuestion(room: GameRoom, clock: ReturnType<typeof makeClock>) {
  expect(room.start()).toEqual({ ok: true })
  expect(room.status).toBe('get_ready')
  clock.advance(GET_READY_MS)
  expect(room.status).toBe('question')
}

function finishQuestion(room: GameRoom, clock: ReturnType<typeof makeClock>) {
  const deadline = room.deadline as number
  clock.advance(deadline + GRACE_MS - clock.now())
  expect(room.status).toBe('reveal')
}

describe('GameRoom', () => {
  it('runs a full cycle with 3 players through 4 questions to ended', () => {
    const { room, clock, changes } = makeRoom()
    const a = join(room, 'Ann')
    const b = join(room, 'Bob')
    const c = join(room, 'Cid')
    expect(room.players.size).toBe(3)
    expect(changes.filter((r) => r.startsWith('player_joined')).length).toBe(3)

    toQuestion(room, clock)
    expect(room.questionIndex).toBe(0)
    expect(room.deadline).toBe(clock.now() + 10_000)

    // q1: Ann fast+correct, Bob slow+correct, Cid wrong
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: true,
      receivedAt: clock.now(),
    })
    clock.advance(5000)
    expect(room.submitAnswer(b, { questionIndex: 0, optionIds: ['q1b'] }, clock.now()).ok).toBe(
      true,
    )
    expect(room.submitAnswer(c, { questionIndex: 0, optionIds: ['q1a'] }, clock.now()).ok).toBe(
      true,
    )
    finishQuestion(room, clock)

    const snapA = room.snapshotFor(a)
    expect(snapA.me?.lastResult).toMatchObject({
      questionIndex: 0,
      correct: true,
      points: 1000,
      rank: 1,
    })
    const snapB = room.snapshotFor(b)
    expect(snapB.me?.lastResult?.points).toBe(750)
    expect(room.snapshotFor(c).me?.lastResult).toMatchObject({ correct: false, points: 0 })
    expect(snapA.reveal?.correctOptionIds).toEqual(['q1b'])
    expect(snapA.reveal?.distribution).toEqual([
      { optionId: 'q1a', count: 1 },
      { optionId: 'q1b', count: 2 },
      { optionId: 'q1c', count: 0 },
      { optionId: 'q1d', count: 0 },
    ])
    expect(snapA.reveal?.answeredCount).toBe(3)
    expect(snapA.reveal?.correctCount).toBe(2)

    expect(room.next()).toEqual({ ok: true })
    expect(room.status).toBe('leaderboard')
    expect(room.snapshotFor('host').leaderboard.map((e) => e.nickname)).toEqual([
      'Ann',
      'Bob',
      'Cid',
    ])
    expect(room.next()).toEqual({ ok: true })
    expect(room.status).toBe('get_ready')
    expect(room.questionIndex).toBe(1)

    // q2 (multiple), q3 (text), q4 (truefalse): everybody answers correctly and instantly
    for (let qi = 1; qi <= 3; qi++) {
      clock.advance(GET_READY_MS)
      expect(room.status).toBe('question')
      const payload =
        qi === 1
          ? { questionIndex: qi, optionIds: ['q2a', 'q2c'] }
          : qi === 2
            ? { questionIndex: qi, text: 'kyiv' }
            : { questionIndex: qi, optionIds: ['q4a'] }
      for (const p of [a, b, c]) expect(room.submitAnswer(p, payload, clock.now()).ok).toBe(true)
      room.next() // host ends the timer early
      expect(room.status).toBe('reveal')
      room.next()
      expect(room.status).toBe('leaderboard')
      room.next()
    }
    expect(room.status).toBe('podium')
    const podium = room.snapshotFor(a)
    expect(podium.finalRanking?.length).toBe(3)
    expect(podium.question).toBeNull()
    expect(room.next()).toEqual({ ok: true })
    expect(room.status).toBe('ended')
    expect(room.endedAt).toBe(clock.now())

    const result = room.buildResult()
    expect(result.playerCount).toBe(3)
    expect(result.questions.length).toBe(4)
    expect(result.players[0]?.nickname).toBe('Ann')
    // Ann: 1000 + 1000 + (1000+100 streak) + (2000+100) = 5200
    expect(result.players[0]?.score).toBe(5200)
    expect(result.players.find((p) => p.nickname === 'Cid')?.correctCount).toBe(3)
    expect(result.hardestQuestionIndex).toBe(0)
    expect(room.next().ok).toBe(false)
  })

  it('rejects late answers, accepts answers within the grace window', () => {
    const { room, clock } = makeRoom()
    const a = join(room, 'Ann')
    const b = join(room, 'Bob')
    toQuestion(room, clock)
    const deadline = room.deadline as number
    clock.jump(deadline + 400)
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now()).ok).toBe(
      true,
    )
    clock.jump(deadline + 600)
    const late = room.submitAnswer(b, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())
    expect(late).toEqual({ ok: false, error: { code: 'TOO_LATE' } })
    expect(room.status).toBe('question')
    clock.advance(0)
    expect(room.status).toBe('reveal')
    expect(room.snapshotFor(a).me?.lastResult?.points).toBe(500)
  })

  it('rejects double answers and answers outside the question phase', () => {
    const { room, clock, counts } = makeRoom()
    const a = join(room, 'Ann')
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'NOT_IN_QUESTION' },
    })
    toQuestion(room, clock)
    expect(room.submitAnswer(a, { questionIndex: 1, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'NOT_IN_QUESTION' },
    })
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['nope'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'INVALID_ANSWER' },
    })
    expect(room.submitAnswer(a, { questionIndex: 0, text: 'x' }, clock.now()).ok).toBe(false)
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now()).ok).toBe(
      true,
    )
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'ALREADY_ANSWERED' },
    })
    expect(counts).toEqual([1])
    room.next()
    expect(room.status).toBe('reveal')
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'NOT_IN_QUESTION' },
    })
  })

  it('keeps score across reconnects', () => {
    const { room, clock, changes } = makeRoom()
    const a = join(room, 'Ann')
    toQuestion(room, clock)
    room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())
    room.next()
    expect(room.snapshotFor(a).me?.score).toBe(1000)
    room.disconnectPlayer(a)
    expect(changes.at(-1)).toBe('player_disconnected')
    expect(room.snapshotFor('host').players[0]?.connected).toBe(false)
    const res = room.resumePlayer(a)
    expect(res.ok).toBe(true)
    const snap = room.snapshotFor(a)
    expect(snap.me?.score).toBe(1000)
    expect(snap.me?.streak).toBe(1)
    expect(snap.players[0]?.connected).toBe(true)
    expect(room.resumePlayer('ghost').ok).toBe(false)
  })

  it('kick blocks the nickname and the token', () => {
    const { room } = makeRoom()
    const a = join(room, 'Troll')
    expect(room.kick(a)).toEqual({ ok: true })
    expect(room.players.size).toBe(0)
    expect(room.addPlayer('troll')).toEqual({ ok: false, error: { code: 'KICKED' } })
    expect(room.addPlayer('TROLL ')).toEqual({ ok: false, error: { code: 'KICKED' } })
    expect(room.resumePlayer(a)).toEqual({ ok: false, error: { code: 'KICKED' } })
    expect(room.addPlayer('Nice').ok).toBe(true)
  })

  it('dedupes nicknames and validates them', () => {
    const { room } = makeRoom()
    join(room, 'Ann')
    const second = room.addPlayer('ann')
    expect(second.ok && second.nickname).toBe('ann 2')
    expect(room.addPlayer('   ')).toEqual({ ok: false, error: { code: 'NICKNAME_INVALID' } })
    expect(room.addPlayer('fuck')).toEqual({ ok: false, error: { code: 'NICKNAME_PROFANE' } })
  })

  it('refuses joins after the lobby', () => {
    const { room, clock } = makeRoom()
    join(room, 'Ann')
    toQuestion(room, clock)
    expect(room.addPlayer('Late')).toEqual({ ok: false, error: { code: 'GAME_ALREADY_STARTED' } })
    room.end()
    expect(room.addPlayer('Later')).toEqual({ ok: false, error: { code: 'GAME_ENDED' } })
  })

  it('info slides have no deadline and skip reveal', () => {
    const [q1] = fourQuestions()
    const info: Question = {
      id: 'i1',
      type: 'info',
      text: 'Welcome!',
      mediaUrl: null,
      options: [],
      timeLimit: 10,
      pointsMultiplier: 1,
    }
    const { room, clock } = makeRoom([info, q1 as Question])
    const a = join(room, 'Ann')
    toQuestion(room, clock)
    expect(room.deadline).toBeNull()
    expect(clock.pending()).toBe(0)
    expect(room.snapshotFor(a).question?.type).toBe('info')
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: [] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'NOT_IN_QUESTION' },
    })
    clock.advance(60_000)
    expect(room.status).toBe('question') // nothing auto-advances an info slide
    room.next()
    expect(room.status).toBe('get_ready')
    expect(room.questionIndex).toBe(1)
    expect(room.snapshotFor(a).me?.streak).toBe(0)
  })

  it('team mode: TOO_EARLY during discussion, team scores are averages', () => {
    const { room, clock } = makeRoom(fourQuestions(), { mode: 'team', teamSize: 2 })
    const a = join(room, 'Ann')
    const b = join(room, 'Bob')
    const c = join(room, 'Cid')
    const snap = room.snapshotFor('host')
    expect(snap.teams.map((t) => t.name)).toEqual(['Команда 1', 'Команда 2'])
    expect(snap.teams[0]?.memberIds).toEqual([a, b])
    expect(snap.teams[1]?.memberIds).toEqual([c])
    // switching teams in the lobby
    expect(room.setTeam(c, 'team-1')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ANSWER' },
    }) // full
    expect(room.setTeam(a, 'team-2')).toEqual({ ok: true })
    expect(room.setTeam(b, 'team-1')).toEqual({ ok: true })

    toQuestion(room, clock)
    const start = clock.now()
    expect(room.discussionUntil).toBe(start + DISCUSSION_MS)
    expect(room.deadline).toBe(start + DISCUSSION_MS + 10_000)
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())).toEqual({
      ok: false,
      error: { code: 'TOO_EARLY' },
    })
    clock.advance(DISCUSSION_MS)
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now()).ok).toBe(
      true,
    ) // 1000
    expect(room.submitAnswer(c, { questionIndex: 0, optionIds: ['q1a'] }, clock.now()).ok).toBe(
      true,
    ) // 0
    expect(room.submitAnswer(b, { questionIndex: 0, optionIds: ['q1b'] }, clock.now()).ok).toBe(
      true,
    ) // 1000
    room.next()
    expect(room.status).toBe('reveal')
    const host = room.snapshotFor('host')
    const t1 = host.teams.find((t) => t.id === 'team-1')
    const t2 = host.teams.find((t) => t.id === 'team-2')
    expect(t1?.score).toBe(1000)
    expect(t2?.score).toBe(500)
    expect(host.leaderboard.map((e) => [e.nickname, e.score, e.rank])).toEqual([
      ['Команда 1', 1000, 1],
      ['Команда 2', 500, 2],
    ])
    expect(room.snapshotFor(c).me?.rank).toBe(2)
    expect(room.snapshotFor(a).me?.lastResult?.answerTimeMs).toBe(0)
  })

  it('multiple-choice gives partial credit and zero on any wrong pick', () => {
    const qs = fourQuestions()
    const { room, clock } = makeRoom([qs[1] as Question])
    const a = join(room, 'Ann')
    const b = join(room, 'Bob')
    const c = join(room, 'Cid')
    toQuestion(room, clock)
    room.submitAnswer(a, { questionIndex: 0, optionIds: ['q2a'] }, clock.now())
    room.submitAnswer(b, { questionIndex: 0, optionIds: ['q2a', 'q2c'] }, clock.now())
    room.submitAnswer(c, { questionIndex: 0, optionIds: ['q2a', 'q2b'] }, clock.now())
    room.next()
    expect(room.snapshotFor(a).me?.lastResult).toMatchObject({
      fraction: 0.5,
      points: 500,
      correct: true,
    })
    expect(room.snapshotFor(b).me?.lastResult).toMatchObject({ fraction: 1, points: 1000 })
    expect(room.snapshotFor(c).me?.lastResult).toMatchObject({
      fraction: 0,
      points: 0,
      correct: false,
    })
  })

  it('shuffled options keep correctness and expose positional index only', () => {
    const rnd = seededRandom(42)
    const qs = fourQuestions().map((q) =>
      q.type === 'single' || q.type === 'multiple' ? { ...q, options: shuffle(q.options, rnd) } : q,
    )
    const { room, clock } = makeRoom(qs, { shuffleOptions: true, showQuestionOnPlayer: false })
    const a = join(room, 'Ann')
    toQuestion(room, clock)
    const shown = room.snapshotFor(a).question!
    expect(shown.options.map((o) => o.index)).toEqual([0, 1, 2, 3])
    expect(shown.options.map((o) => o.id).sort()).toEqual(['q1a', 'q1b', 'q1c', 'q1d'])
    expect(JSON.stringify(shown)).not.toContain('isCorrect')
    expect(shown.text).toBeNull() // showQuestionOnPlayer is off for this room
    expect(room.snapshotFor('host').question?.text).toBe('2 + 2 = ?')
    room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())
    room.next()
    expect(room.snapshotFor(a).me?.lastResult?.points).toBe(1000)
  })

  it('streak bonus appears from the third consecutive correct answer', () => {
    const { room, clock } = makeRoom()
    const a = join(room, 'Ann')
    toQuestion(room, clock)
    const answers = [
      { questionIndex: 0, optionIds: ['q1b'] },
      { questionIndex: 1, optionIds: ['q2a', 'q2c'] },
      { questionIndex: 2, text: 'Київ' },
    ]
    const points: number[] = []
    answers.forEach((payload, i) => {
      if (i > 0) clock.advance(GET_READY_MS)
      room.submitAnswer(a, payload, clock.now())
      room.next()
      points.push(room.snapshotFor(a).me!.lastResult!.points)
      room.next()
      room.next()
    })
    expect(points).toEqual([1000, 1000, 1000 + STREAK_BONUS])
    expect(room.snapshotFor(a).me?.streak).toBe(3)
  })

  it('unanswered ×0 questions do not break a streak', () => {
    const qs = fourQuestions()
    const zero: Question = { ...(qs[0] as Question), id: 'z', pointsMultiplier: 0 }
    const { room, clock } = makeRoom([qs[0] as Question, zero, qs[3] as Question])
    const a = join(room, 'Ann')
    toQuestion(room, clock)
    room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())
    room.next()
    room.next()
    room.next()
    clock.advance(GET_READY_MS)
    finishQuestion(room, clock) // no answer on the ×0 question
    expect(room.snapshotFor(a).me?.streak).toBe(1)
    expect(room.snapshotFor(a).me?.lastResult?.points).toBe(0)
  })

  it('produces a CSV with the documented header and rows', () => {
    const { room, clock } = makeRoom()
    const a = join(room, 'Ann')
    const b = join(room, 'Bob Jr.')
    toQuestion(room, clock)
    room.submitAnswer(a, { questionIndex: 0, optionIds: ['q1b'] }, clock.now())
    clock.advance(1000)
    room.submitAnswer(b, { questionIndex: 0, optionIds: ['q1a'] }, clock.now())
    room.next()
    room.end()
    const csv = resultToCsv(room.buildResult())
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe(
      'rank,nickname,score,correct,total,q1,q2,q3,q4,q1_time_ms,q2_time_ms,q3_time_ms,q4_time_ms',
    )
    expect(lines[1]).toBe('1,Ann,1000,1,4,1000,0,0,0,0,,,')
    expect(lines[2]).toBe('2,Bob Jr.,0,0,4,0,0,0,0,1000,,,')
  })

  it('settings can only change in the lobby and re-balance teams', () => {
    const { room, clock } = makeRoom()
    join(room, 'Ann')
    join(room, 'Bob')
    expect(room.updateSettings({ mode: 'team', teamSize: 2 })).toEqual({ ok: true })
    expect(room.snapshotFor('host').teams.length).toBe(1)
    expect(room.updateSettings({ showQuestionOnPlayer: true })).toEqual({ ok: true })
    toQuestion(room, clock)
    expect(room.updateSettings({ shuffleOptions: true })).toMatchObject({
      ok: false,
      error: { code: 'GAME_ALREADY_STARTED' },
    })
    expect(room.snapshotFor('host').settings.showQuestionOnPlayer).toBe(true)
  })
})

describe('end when all answered', () => {
  it('reveals as soon as every connected player has answered', () => {
    const { room, clock } = makeRoom(fourQuestions(), { endWhenAllAnswered: true })
    const a = join(room, 'A')
    const b = join(room, 'B')
    const c = join(room, 'C')
    toQuestion(room, clock)
    const q = room.currentQuestion!
    const correct = q.options.find((o) => o.isCorrect)!.id
    expect(room.submitAnswer(a, { questionIndex: 0, optionIds: [correct] }, clock.now()).ok).toBe(
      true,
    )
    expect(room.status).toBe('question')
    // C drops out mid-question: the room stops waiting for them.
    room.disconnectPlayer(c)
    expect(room.submitAnswer(b, { questionIndex: 0, optionIds: [correct] }, clock.now()).ok).toBe(
      true,
    )
    expect(room.status).toBe('reveal')
    expect(room.snapshotFor('host').reveal?.answeredCount).toBe(2)
  })

  it('keeps waiting for the timer when the setting is off', () => {
    const { room, clock } = makeRoom(fourQuestions(), { endWhenAllAnswered: false })
    const a = join(room, 'A')
    toQuestion(room, clock)
    const q = room.currentQuestion!
    room.submitAnswer(a, { questionIndex: 0, optionIds: [q.options[0]!.id] }, clock.now())
    expect(room.status).toBe('question')
  })

  it('assigns every player a random animal avatar exposed in snapshots', () => {
    const { room } = makeRoom(fourQuestions())
    const a = join(room, 'A')
    const snap = room.snapshotFor(a)
    expect(snap.me?.avatar).toMatch(/^[a-z][a-z0-9_-]*-\d$/)
    expect(snap.players[0]?.avatar).toBe(snap.me?.avatar)
  })
})

describe('closing the room', () => {
  it('cancelling from the lobby ends the room with endReason "cancelled"', () => {
    const { room } = makeRoom()
    const a = join(room, 'A')
    expect(room.hostSnapshot().endReason).toBeNull()
    expect(room.end('cancelled')).toEqual({ ok: true })
    expect(room.status).toBe('ended')
    expect(room.hostSnapshot().endReason).toBe('cancelled')
    expect(room.snapshotFor(a).endReason).toBe('cancelled')
    // Idempotent: a second end keeps the original reason.
    expect(room.end()).toEqual({ ok: true })
    expect(room.endReason).toBe('cancelled')
  })

  it('a game played to the end reports "completed"', () => {
    const { room, clock } = makeRoom([fourQuestions()[0]!])
    join(room, 'A')
    toQuestion(room, clock)
    room.next() // reveal
    room.next() // leaderboard
    room.next() // podium
    room.next() // ended
    expect(room.status).toBe('ended')
    expect(room.hostSnapshot().endReason).toBe('completed')
  })

  it('host absence is reported as "host_left"', () => {
    const { room } = makeRoom()
    join(room, 'A')
    room.end('host_left')
    expect(room.hostSnapshot().endReason).toBe('host_left')
  })
})

describe('avatar choice on join', () => {
  it('keeps a valid avatar picked by the player', () => {
    const { room } = makeRoom()
    const res = room.addPlayer('Ann', { avatar: `${AVATAR_ANIMALS[0]}-3` })
    expect(res.ok && res.avatar).toBe(`${AVATAR_ANIMALS[0]}-3`)
  })

  it('falls back to a random avatar for unknown ids', () => {
    const { room } = makeRoom()
    const res = room.addPlayer('Bob', { avatar: 'not-a-real-avatar-99' })
    expect(res.ok && res.avatar).not.toBe('not-a-real-avatar-99')
    expect(res.ok && parseAvatar(res.avatar)).not.toBeNull()
  })
})
