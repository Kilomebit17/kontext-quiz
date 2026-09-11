/**
 * Room load test: one game, N socket.io players, Q questions.
 *
 *   API_URL=http://localhost:4000 PLAYERS=200 QUESTIONS=5 pnpm test:load
 *
 * Measures, per `state` broadcast, `Date.now() - snapshot.serverTime` corrected by
 * the clock offset from time:ping, plus the ack latency of player:answer.
 * Exits non-zero when the p95 broadcast latency exceeds 300 ms.
 */
import { io as connect, type Socket } from 'socket.io-client'
import type { Ack, AnswerAck, GameSnapshot, JoinResult, TimePingResult } from '@kontext/shared'

const API_URL = process.env.API_URL ?? 'http://localhost:4000'
const PLAYERS = Number(process.env.PLAYERS ?? 200)
const QUESTIONS = Number(process.env.QUESTIONS ?? 5)
const P95_LIMIT_MS = Number(process.env.P95_LIMIT_MS ?? 300)
const TIME_LIMIT = 20

type Client = Socket

const emitAck = <T>(s: Client, event: string, ...args: unknown[]) =>
  new Promise<T>((resolve) => {
    ;(s as unknown as { emit: (...a: unknown[]) => void }).emit(event, ...args, (r: T) =>
      resolve(r),
    )
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx] as number
}

function fmt(values: number[]): string {
  return `n=${values.length} p50=${percentile(values, 50)}ms p95=${percentile(values, 95)}ms p99=${percentile(values, 99)}ms max=${Math.max(0, ...values)}ms`
}

async function clockOffset(s: Client): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now()
    const r = await emitAck<TimePingResult>(s, 'time:ping', { t0 })
    const t1 = Date.now()
    samples.push(r.serverTime - (t0 + (t1 - t0) / 2))
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] as number
}

function buildQuiz(n: number) {
  const questions = []
  for (let i = 0; i < n; i++) {
    questions.push({
      id: `q${i}`,
      type: 'single',
      text: `Question ${i + 1}`,
      options: [
        { id: `q${i}a`, text: 'A', isCorrect: i % 2 === 0 },
        { id: `q${i}b`, text: 'B', isCorrect: i % 2 === 1 },
        { id: `q${i}c`, text: 'C', isCorrect: false },
        { id: `q${i}d`, text: 'D', isCorrect: false },
      ],
      timeLimit: TIME_LIMIT,
      pointsMultiplier: 1,
    })
  }
  return { title: `Load test ${PLAYERS}p/${n}q`, visibility: 'private', questions }
}

async function main() {
  console.log(`API_URL=${API_URL} PLAYERS=${PLAYERS} QUESTIONS=${QUESTIONS}`)
  const res = await fetch(`${API_URL}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quiz: buildQuiz(QUESTIONS) }),
  })
  if (res.status !== 201) throw new Error(`create game failed: ${res.status} ${await res.text()}`)
  const game = (await res.json()) as { sessionId: string; pin: string; hostToken: string }
  console.log(`game ${game.sessionId} pin ${game.pin}`)

  const host = connect(API_URL, { transports: ['websocket'], forceNew: true })
  await new Promise<void>((r) => host.once('connect', () => r()))
  const hj = await emitAck<Ack<{ snapshot: GameSnapshot }>>(host, 'host:join', {
    hostToken: game.hostToken,
  })
  if (!hj.ok) throw new Error(`host join failed: ${hj.error.code}`)

  const stateLatencies: number[] = []
  const ackLatencies: number[] = []
  let joinErrors = 0
  let answerErrors = 0
  const answeredPerQuestion = new Map<number, number>()
  const players: { socket: Client; offset: number; id: string }[] = []

  // Stagger joins 5 ms apart.
  const joinStart = Date.now()
  for (let i = 0; i < PLAYERS; i++) {
    const s = connect(API_URL, { transports: ['websocket'], forceNew: true })
    void (async () => {
      await new Promise<void>((r) => s.once('connect', () => r()))
      const offset = await clockOffset(s)
      const r = await emitAck<Ack<JoinResult>>(s, 'player:join', {
        pin: game.pin,
        nickname: `p${i}`,
      })
      if (!r.ok) {
        joinErrors++
        if (joinErrors <= 3) console.error('join failed', r.error)
        s.disconnect()
        return
      }
      players.push({ socket: s, offset, id: r.playerId })
      s.on('state', (snap: GameSnapshot) => {
        stateLatencies.push(Date.now() + offset - snap.serverTime)
        if (snap.status === 'question' && snap.deadline && !snap.me?.hasAnswered) {
          const q = snap.question
          if (!q || q.type === 'info') return
          const delay = Math.random() * 2000
          setTimeout(async () => {
            const pick = q.options[Math.floor(Math.random() * q.options.length)]
            const t0 = Date.now()
            const ack = await emitAck<Ack<AnswerAck>>(s, 'player:answer', {
              questionIndex: snap.questionIndex,
              optionIds: [pick?.id],
            })
            ackLatencies.push(Date.now() - t0)
            if (!ack.ok) {
              answerErrors++
            } else {
              answeredPerQuestion.set(
                snap.questionIndex,
                (answeredPerQuestion.get(snap.questionIndex) ?? 0) + 1,
              )
            }
          }, delay)
        }
      })
    })()
    await sleep(5)
  }
  // Wait for all joins to settle.
  while (players.length + joinErrors < PLAYERS && Date.now() - joinStart < 60_000) await sleep(100)
  console.log(
    `joined ${players.length}/${PLAYERS} (errors ${joinErrors}) in ${Date.now() - joinStart}ms`,
  )
  if (joinErrors > 0) {
    console.error(
      `FAIL: ${joinErrors} joins failed. All players share one IP here — if you see RATE_LIMITED, start the server with JOIN_RATE_LIMIT_PER_MIN=${PLAYERS * 2}.`,
    )
    process.exit(1)
  }

  let hostStatus: GameSnapshot['status'] = 'lobby'
  let hostAnswered = 0
  host.on('state', (snap: GameSnapshot) => {
    hostStatus = snap.status
  })
  host.on('answer:count', (p: { answeredCount: number }) => {
    hostAnswered = p.answeredCount
  })
  const next = () => emitAck<Ack>(host, 'host:next')
  const waitStatus = async (status: GameSnapshot['status'], timeoutMs = 30_000) => {
    const start = Date.now()
    while (hostStatus !== status) {
      if (Date.now() - start > timeoutMs)
        throw new Error(`timeout waiting for ${status} (at ${hostStatus})`)
      await sleep(20)
    }
  }

  await emitAck<Ack>(host, 'host:start')
  for (let qi = 0; qi < QUESTIONS; qi++) {
    await waitStatus('question')
    hostAnswered = 0
    const qStart = Date.now()
    while (hostAnswered < players.length && Date.now() - qStart < 4000) await sleep(20)
    const phaseStart = Date.now()
    await next() // reveal
    await waitStatus('reveal')
    console.log(
      `q${qi + 1}: answered ${hostAnswered}/${players.length}, reveal broadcast in ${Date.now() - phaseStart}ms`,
    )
    await next() // leaderboard
    await waitStatus('leaderboard')
    await next() // next get_ready or podium
    if (qi + 1 < QUESTIONS) {
      await waitStatus('get_ready')
      await next() // skip countdown
    }
  }
  await waitStatus('podium')
  await next()
  await waitStatus('ended')
  await sleep(500)

  console.log('')
  console.log(`state broadcast latency: ${fmt(stateLatencies)}`)
  console.log(`answer ack latency:      ${fmt(ackLatencies)}`)
  console.log(`answer errors: ${answerErrors}`)

  host.disconnect()
  for (const p of players) p.socket.disconnect()

  const p95 = percentile(stateLatencies, 95)
  if (p95 > P95_LIMIT_MS) {
    console.error(`FAIL: p95 ${p95}ms > ${P95_LIMIT_MS}ms`)
    process.exit(1)
  }
  console.log('OK')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
