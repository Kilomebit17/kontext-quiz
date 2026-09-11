import { randomUUID } from 'node:crypto'
import { OK, fail, type ErrAck } from './ack.js'
import {
  DISCUSSION_MS,
  GET_READY_MS,
  GRACE_MS,
  computeScore,
  dedupeNickname,
  evaluateAnswer,
  normalizeText,
  rankPlayers,
  randomAvatar,
  transition,
  isAvatarId,
  validateNickname,
  type Ack,
  type AnswerAck,
  type AnswerPayload,
  type AnswerResult,
  type EndReason,
  type GameEvent,
  type GameResult,
  type GameResultPlayer,
  type GameResultQuestionStat,
  type GameSettings,
  type GameSnapshot,
  type GameStatus,
  type LeaderboardEntry,
  type MePlayer,
  type PlayerPublic,
  type PublicQuestion,
  type Question,
  type RevealData,
  type Team,
} from '@kontext/shared'

export interface PlayerAnswer {
  optionIds: string[]
  text: string | null
  answerTimeMs: number
  receivedAt: number
  /** 0..1 — computed at submit time. */
  fraction: number
  /** Computed at reveal. */
  points: number
}

export interface PlayerRecord {
  id: string
  nickname: string
  /** Random animal avatar, assigned on join. */
  avatar: string
  score: number
  streak: number
  connected: boolean
  teamId: string | null
  /** Rank after the latest reveal (1 in lobby). */
  rank: number
  previousRank: number | null
  answers: Map<number, PlayerAnswer>
  lastResult: AnswerResult | null
  joinedAt: number
}

interface TeamRecord extends Team {
  rank: number
  previousRank: number | null
}

export type ChangeReason =
  | 'phase'
  | 'player_joined'
  | 'player_left'
  | 'player_kicked'
  | 'player_connected'
  | 'player_disconnected'
  | 'team_changed'
  | 'settings'

export type Cancel = () => void

export interface RoomQuiz {
  id: string | null
  title: string
  questions: Question[]
}

export interface GameRoomOptions {
  sessionId: string
  pin: string
  /** Questions already shuffled / options shuffled according to settings. */
  quiz: RoomQuiz
  settings: GameSettings
  hostId: string | null
  now: () => number
  schedule: (fn: () => void, ms: number) => Cancel
  onChange?: (room: GameRoom, reason: ChangeReason) => void
  onAnswerCount?: (room: GameRoom, answeredCount: number, totalPlayers: number) => void
}

type RoomError = ErrAck
const err = fail

const TEAM_NAME = (n: number) => `Команда ${n}`

/**
 * GameRoom: the authoritative game engine for one session.
 *
 * Pure-ish: no I/O. Time comes from `now()`, timers from `schedule()`, and
 * observers subscribe through `onChange` / `onAnswerCount`. Scoring, ranking
 * and phase transitions are delegated to `@kontext/shared`.
 */
export class GameRoom {
  readonly sessionId: string
  readonly pin: string
  readonly hostId: string | null
  readonly quizId: string | null
  readonly quizTitle: string
  readonly createdAt: number

  settings: GameSettings
  status: GameStatus = 'lobby'
  questionIndex = -1
  questions: Question[]

  deadline: number | null = null
  questionStartedAt: number | null = null
  discussionUntil: number | null = null
  startedAt: number | null = null
  endedAt: number | null = null
  endReason: EndReason | null = null

  readonly players = new Map<string, PlayerRecord>()
  readonly teams = new Map<string, TeamRecord>()
  private teamSeq = 0
  private readonly blockedIds = new Set<string>()
  private readonly blockedNicknames = new Set<string>()

  private reveal: RevealData | null = null
  private leaderboard: LeaderboardEntry[] = []
  private answeredCount = 0
  private cancelTimer: Cancel | null = null

  /** Cached final result once ended. */
  private result: GameResult | null = null

  private readonly now: () => number
  private readonly schedule: GameRoomOptions['schedule']
  private readonly onChange: GameRoomOptions['onChange']
  private readonly onAnswerCount: GameRoomOptions['onAnswerCount']

  constructor(opts: GameRoomOptions) {
    this.sessionId = opts.sessionId
    this.pin = opts.pin
    this.hostId = opts.hostId
    this.quizId = opts.quiz.id
    this.quizTitle = opts.quiz.title
    this.questions = opts.quiz.questions
    this.settings = { ...opts.settings }
    this.now = opts.now
    this.schedule = opts.schedule
    this.onChange = opts.onChange
    this.onAnswerCount = opts.onAnswerCount
    this.createdAt = opts.now()
  }

  // ---------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------

  get questionCount(): number {
    return this.questions.length
  }

  get currentQuestion(): Question | null {
    return this.questionIndex >= 0 ? (this.questions[this.questionIndex] ?? null) : null
  }

  get isTeamMode(): boolean {
    return this.settings.mode === 'team'
  }

  get connectedPlayerCount(): number {
    let n = 0
    for (const p of this.players.values()) if (p.connected) n++
    return n
  }

  isBlocked(playerId: string): boolean {
    return this.blockedIds.has(playerId)
  }

  // ---------------------------------------------------------------------------
  // Lobby: players & teams
  // ---------------------------------------------------------------------------

  addPlayer(
    rawNickname: string,
    opts: { teamId?: string | null; avatar?: string | null } = {},
  ): { ok: true; playerId: string; nickname: string; avatar: string } | RoomError {
    if (this.status === 'ended') return err('GAME_ENDED')
    if (this.status !== 'lobby') return err('GAME_ALREADY_STARTED')
    const v = validateNickname(rawNickname)
    if (!v.ok) return err(v.error)
    if (this.blockedNicknames.has(v.nickname.toLowerCase())) return err('KICKED')
    const taken = Array.from(this.players.values(), (p) => p.nickname)
    const nickname = dedupeNickname(v.nickname, taken)
    if (this.blockedNicknames.has(nickname.toLowerCase())) return err('KICKED')

    const player: PlayerRecord = {
      id: randomUUID(),
      nickname,
      // The player's pick from the join screen, or a random character.
      avatar: isAvatarId(opts.avatar) ? opts.avatar : randomAvatar(),
      score: 0,
      streak: 0,
      connected: true,
      teamId: null,
      rank: 1,
      previousRank: null,
      answers: new Map(),
      lastResult: null,
      joinedAt: this.now(),
    }
    this.players.set(player.id, player)
    if (this.isTeamMode) this.assignTeam(player, opts.teamId ?? null)
    this.emitChange('player_joined')
    return { ok: true, playerId: player.id, nickname, avatar: player.avatar }
  }

  resumePlayer(playerId: string): { ok: true; player: PlayerRecord } | RoomError {
    if (this.blockedIds.has(playerId)) return err('KICKED')
    const p = this.players.get(playerId)
    if (!p) return err('INVALID_TOKEN', 'Unknown player')
    if (!p.connected) {
      p.connected = true
      this.emitChange('player_connected')
    }
    return { ok: true, player: p }
  }

  disconnectPlayer(playerId: string): void {
    const p = this.players.get(playerId)
    if (!p || !p.connected) return
    p.connected = false
    this.emitChange('player_disconnected')
  }

  /** Voluntary leave: in the lobby the player is removed; mid-game it is just a disconnect. */
  leavePlayer(playerId: string): void {
    const p = this.players.get(playerId)
    if (!p) return
    if (this.status === 'lobby') {
      this.players.delete(playerId)
      this.removeFromTeam(p)
      this.emitChange('player_left')
    } else {
      this.disconnectPlayer(playerId)
    }
  }

  kick(playerId: string): Ack {
    const p = this.players.get(playerId)
    if (!p) return err('GAME_NOT_FOUND', 'Unknown player')
    this.players.delete(playerId)
    this.removeFromTeam(p)
    this.blockedIds.add(playerId)
    this.blockedNicknames.add(p.nickname.toLowerCase())
    if (this.status === 'question' && p.answers.has(this.questionIndex)) {
      this.answeredCount = Math.max(0, this.answeredCount - 1)
    }
    this.emitChange('player_kicked')
    return OK
  }

  setTeam(playerId: string, teamId: string): Ack {
    if (!this.isTeamMode) return err('INVALID_TRANSITION', 'Not a team game')
    if (this.status !== 'lobby') return err('GAME_ALREADY_STARTED')
    const p = this.players.get(playerId)
    if (!p) return err('INVALID_TOKEN')
    const team = this.teams.get(teamId)
    if (!team) return err('INVALID_ANSWER', 'Unknown team')
    if (team.id === p.teamId) return OK
    if (team.memberIds.length >= this.settings.teamSize)
      return err('INVALID_ANSWER', 'Team is full')
    this.removeFromTeam(p)
    team.memberIds.push(p.id)
    p.teamId = team.id
    this.emitChange('team_changed')
    return OK
  }

  updateSettings(patch: Partial<GameSettings>): Ack {
    if (this.status !== 'lobby') return err('GAME_ALREADY_STARTED')
    const before = this.settings
    this.settings = { ...before, ...patch }
    if (before.mode !== this.settings.mode || before.teamSize !== this.settings.teamSize) {
      // Re-balance teams from scratch.
      this.teams.clear()
      this.teamSeq = 0
      for (const p of this.players.values()) p.teamId = null
      if (this.isTeamMode) for (const p of this.players.values()) this.assignTeam(p, null)
    }
    this.emitChange('settings')
    return OK
  }

  private assignTeam(p: PlayerRecord, preferred: string | null): void {
    const size = this.settings.teamSize
    let target: TeamRecord | undefined
    if (preferred) {
      const t = this.teams.get(preferred)
      if (t && t.memberIds.length < size) target = t
    }
    if (!target) {
      for (const t of this.teams.values()) {
        if (t.memberIds.length >= size) continue
        if (!target || t.memberIds.length < target.memberIds.length) target = t
      }
    }
    if (!target) {
      this.teamSeq += 1
      target = {
        id: `team-${this.teamSeq}`,
        name: TEAM_NAME(this.teamSeq),
        memberIds: [],
        score: 0,
        rank: 1,
        previousRank: null,
      }
      this.teams.set(target.id, target)
    }
    target.memberIds.push(p.id)
    p.teamId = target.id
  }

  private removeFromTeam(p: PlayerRecord): void {
    if (!p.teamId) return
    const t = this.teams.get(p.teamId)
    if (t) {
      t.memberIds = t.memberIds.filter((id) => id !== p.id)
      if (t.memberIds.length === 0 && this.status === 'lobby') this.teams.delete(t.id)
    }
    p.teamId = null
  }

  // ---------------------------------------------------------------------------
  // Host controls
  // ---------------------------------------------------------------------------

  start(): Ack {
    return this.dispatch({ type: 'START' })
  }

  next(): Ack {
    return this.dispatch({ type: 'NEXT' })
  }

  end(reason: EndReason = 'completed'): Ack {
    if (this.status === 'ended') return OK
    this.endReason = reason
    const ack = this.dispatch({ type: 'END' })
    if (!ack.ok) this.endReason = null
    return ack
  }

  private dispatch(event: GameEvent): Ack {
    let t
    try {
      t = transition(
        {
          status: this.status,
          questionIndex: this.questionIndex,
          questionCount: this.questionCount,
          currentQuestionType: this.currentQuestion?.type ?? null,
          playerCount: this.players.size,
        },
        event,
      )
    } catch (e) {
      return err('INVALID_TRANSITION', e instanceof Error ? e.message : undefined)
    }
    this.applyTransition(t.status, t.questionIndex)
    return OK
  }

  private applyTransition(status: GameStatus, questionIndex: number): void {
    this.clearTimer()
    const prev = this.status
    this.status = status
    this.questionIndex = questionIndex

    switch (status) {
      case 'get_ready': {
        if (prev === 'lobby') this.startedAt = this.now()
        // `deadline` doubles as "when this phase ends" so clients can render the 3-2-1 countdown.
        this.deadline = this.now() + GET_READY_MS
        this.questionStartedAt = null
        this.discussionUntil = null
        this.reveal = null
        this.answeredCount = 0
        this.cancelTimer = this.schedule(
          () => this.dispatch({ type: 'COUNTDOWN_DONE' }),
          GET_READY_MS,
        )
        break
      }
      case 'question': {
        const q = this.currentQuestion
        const now = this.now()
        this.questionStartedAt = now
        this.answeredCount = 0
        this.reveal = null
        if (!q || q.type === 'info') {
          this.deadline = null
          this.discussionUntil = null
        } else {
          this.discussionUntil = this.isTeamMode ? now + DISCUSSION_MS : null
          this.deadline = (this.discussionUntil ?? now) + q.timeLimit * 1000
          const fireIn = this.deadline + GRACE_MS - now
          this.cancelTimer = this.schedule(() => this.dispatch({ type: 'TIMER_DONE' }), fireIn)
        }
        break
      }
      case 'reveal': {
        this.scoreCurrentQuestion()
        break
      }
      case 'leaderboard':
        break
      case 'podium': {
        this.deadline = null
        this.discussionUntil = null
        this.reveal = null
        break
      }
      case 'ended': {
        this.endedAt = this.now()
        this.endReason ??= 'completed'
        this.deadline = null
        this.discussionUntil = null
        break
      }
      case 'lobby':
        break
    }
    this.emitChange('phase')
  }

  private clearTimer(): void {
    if (this.cancelTimer) {
      this.cancelTimer()
      this.cancelTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Answers (hot path — no allocations beyond the answer record)
  // ---------------------------------------------------------------------------

  submitAnswer(playerId: string, payload: AnswerPayload, receivedAt: number): Ack<AnswerAck> {
    const p = this.players.get(playerId)
    if (!p) return err(this.blockedIds.has(playerId) ? 'KICKED' : 'INVALID_TOKEN')
    const q = this.currentQuestion
    if (this.status !== 'question' || !q || q.type === 'info') return err('NOT_IN_QUESTION')
    if (payload.questionIndex !== this.questionIndex) return err('NOT_IN_QUESTION')
    if (p.answers.has(this.questionIndex)) return err('ALREADY_ANSWERED')
    if (this.discussionUntil !== null && receivedAt < this.discussionUntil) return err('TOO_EARLY')
    if (this.deadline !== null && receivedAt > this.deadline + GRACE_MS) return err('TOO_LATE')

    let optionIds: string[] = []
    let text: string | null = null
    switch (q.type) {
      case 'single':
      case 'truefalse': {
        const ids = payload.optionIds
        if (!ids || ids.length !== 1 || !this.hasOption(q, ids[0])) return err('INVALID_ANSWER')
        optionIds = [ids[0] as string]
        break
      }
      case 'multiple': {
        const ids = payload.optionIds
        if (!ids || ids.length === 0 || ids.length > q.options.length) return err('INVALID_ANSWER')
        const uniq = new Set(ids)
        if (uniq.size !== ids.length) return err('INVALID_ANSWER')
        for (const id of ids) if (!this.hasOption(q, id)) return err('INVALID_ANSWER')
        optionIds = ids
        break
      }
      case 'text': {
        if (typeof payload.text !== 'string') return err('INVALID_ANSWER')
        const trimmed = payload.text.trim()
        if (!trimmed || trimmed.length > 200) return err('INVALID_ANSWER')
        text = trimmed
        break
      }
      default:
        return err('NOT_IN_QUESTION')
    }

    const start = this.discussionUntil ?? this.questionStartedAt ?? receivedAt
    const answerTimeMs = Math.max(0, receivedAt - start)
    const fraction = evaluateAnswer(q, text !== null ? { text } : { optionIds })
    p.answers.set(this.questionIndex, {
      optionIds,
      text,
      answerTimeMs,
      receivedAt,
      fraction,
      points: 0,
    })
    this.answeredCount += 1
    this.onAnswerCount?.(this, this.answeredCount, this.players.size)
    if (this.settings.endWhenAllAnswered && this.everyoneAnswered()) {
      // Nobody left to wait for: reveal right away instead of running out the clock.
      this.dispatch({ type: 'TIMER_DONE' })
    }
    return { ok: true, receivedAt }
  }

  /** True when every connected player has answered the current question (disconnected ones are not waited for). */
  private everyoneAnswered(): boolean {
    let connected = 0
    for (const p of this.players.values()) {
      if (!p.connected) continue
      connected += 1
      if (!p.answers.has(this.questionIndex)) return false
    }
    return connected > 0
  }

  private hasOption(q: Question, id: string | undefined): boolean {
    if (!id) return false
    for (const o of q.options) if (o.id === id) return true
    return false
  }

  // ---------------------------------------------------------------------------
  // Scoring at reveal
  // ---------------------------------------------------------------------------

  private scoreCurrentQuestion(): void {
    const q = this.currentQuestion
    if (!q) return
    const idx = this.questionIndex
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id)
    const distribution = new Map<string, number>()
    for (const o of q.options) distribution.set(o.id, 0)
    const textBuckets = new Map<string, { text: string; count: number; correct: boolean }>()
    let answeredCount = 0
    let correctCount = 0

    // Snapshot ranks before scoring (for FLIP animations).
    for (const p of this.players.values()) p.previousRank = p.rank
    for (const t of this.teams.values()) t.previousRank = t.rank

    for (const p of this.players.values()) {
      const a = p.answers.get(idx)
      const streakBefore = p.streak
      let points = 0
      let fraction = 0
      let answerTimeMs = 0
      let correct = false
      if (a) {
        answeredCount += 1
        fraction = a.fraction
        answerTimeMs = a.answerTimeMs
        const s = computeScore({
          fraction,
          answerTimeMs,
          timeLimitSec: q.timeLimit,
          multiplier: q.pointsMultiplier,
          streakBefore,
        })
        points = s.points
        correct = s.correct
        // A ×0 question never breaks a streak; a correct answer still extends it.
        p.streak = s.correct ? s.streakAfter : q.pointsMultiplier === 0 ? streakBefore : 0
        a.points = points
        if (correct) correctCount += 1
        for (const id of a.optionIds) distribution.set(id, (distribution.get(id) ?? 0) + 1)
        if (a.text !== null) {
          const key = normalizeText(a.text)
          const b = textBuckets.get(key)
          if (b) b.count += 1
          else textBuckets.set(key, { text: a.text, count: 1, correct })
        }
      } else {
        p.streak = q.pointsMultiplier === 0 ? streakBefore : 0
      }
      p.score += points
      p.lastResult = {
        questionIndex: idx,
        answered: a !== undefined,
        correct,
        fraction,
        points,
        streak: p.streak,
        score: p.score,
        rank: 0, // filled below
        answerTimeMs,
      }
    }

    this.recomputeRanks()
    for (const p of this.players.values()) {
      if (p.lastResult) p.lastResult.rank = this.rankFor(p)
    }

    this.reveal = {
      correctOptionIds: q.type === 'text' ? [] : correctIds,
      acceptedAnswers: q.type === 'text' ? q.options.map((o) => o.text) : [],
      distribution: q.options.map((o) => ({ optionId: o.id, count: distribution.get(o.id) ?? 0 })),
      textDistribution: [...textBuckets.values()].sort((a, b) => b.count - a.count),
      answeredCount,
      correctCount,
      totalPlayers: this.players.size,
    }
  }

  /** Rank players (and teams) and refresh the cached top-5 leaderboard. */
  private recomputeRanks(): void {
    const ranked = rankPlayers([...this.players.values()])
    for (const r of ranked) {
      const p = this.players.get(r.id)
      if (p) p.rank = r.rank
    }
    if (this.isTeamMode) {
      for (const t of this.teams.values()) {
        let sum = 0
        for (const id of t.memberIds) sum += this.players.get(id)?.score ?? 0
        t.score = t.memberIds.length ? Math.round(sum / t.memberIds.length) : 0
      }
      const rankedTeams = rankPlayers(
        [...this.teams.values()].map((t) => ({ id: t.id, nickname: t.name, score: t.score })),
      )
      for (const r of rankedTeams) {
        const t = this.teams.get(r.id)
        if (t) t.rank = r.rank
      }
      this.leaderboard = this.fullRanking().slice(0, 5)
    } else {
      this.leaderboard = this.fullRanking().slice(0, 5)
    }
  }

  private rankFor(p: PlayerRecord): number {
    if (this.isTeamMode && p.teamId) return this.teams.get(p.teamId)?.rank ?? p.rank
    return p.rank
  }

  /** Everyone (players, or teams in team mode), sorted by rank. */
  private fullRanking(): LeaderboardEntry[] {
    if (this.isTeamMode) {
      return [...this.teams.values()]
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
        .map((t) => {
          let streak = 0
          for (const id of t.memberIds) streak = Math.max(streak, this.players.get(id)?.streak ?? 0)
          return {
            playerId: t.id,
            nickname: t.name,
            avatar: null,
            score: t.score,
            streak,
            rank: t.rank,
            previousRank: t.previousRank,
            teamId: t.id,
          }
        })
    }
    return [...this.players.values()]
      .sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname))
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        rank: p.rank,
        previousRank: p.previousRank,
        teamId: p.teamId,
      }))
  }

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  private emitChange(reason: ChangeReason): void {
    this.onChange?.(this, reason)
  }

  private publicQuestion(includeText: boolean): PublicQuestion | null {
    const q = this.currentQuestion
    if (!q || this.status === 'lobby' || this.status === 'podium' || this.status === 'ended')
      return null
    return {
      id: q.id,
      index: this.questionIndex,
      total: this.questionCount,
      type: q.type,
      text: includeText ? q.text : null,
      mediaUrl: q.mediaUrl ?? null,
      options:
        q.type === 'text' ? [] : q.options.map((o, i) => ({ id: o.id, text: o.text, index: i })),
      timeLimit: q.timeLimit,
      pointsMultiplier: q.pointsMultiplier,
    }
  }

  private publicPlayers(): PlayerPublic[] {
    const out: PlayerPublic[] = []
    for (const p of this.players.values()) {
      out.push({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        connected: p.connected,
        teamId: p.teamId,
      })
    }
    return out
  }

  private publicTeams(): Team[] {
    if (!this.isTeamMode) return []
    return [...this.teams.values()].map((t) => ({
      id: t.id,
      name: t.name,
      memberIds: [...t.memberIds],
      score: t.score,
    }))
  }

  private baseSnapshot(forHost: boolean): GameSnapshot {
    const showReveal = this.status === 'reveal' || this.status === 'leaderboard'
    const finalPhase = this.status === 'podium' || this.status === 'ended'
    return {
      sessionId: this.sessionId,
      pin: this.pin,
      quizTitle: this.quizTitle,
      status: this.status,
      settings: this.settings,
      questionIndex: this.questionIndex,
      questionCount: this.questionCount,
      serverTime: this.now(),
      deadline: this.status === 'question' || this.status === 'get_ready' ? this.deadline : null,
      questionStartedAt: this.status === 'question' ? this.questionStartedAt : null,
      discussionUntil: this.status === 'question' ? this.discussionUntil : null,
      players: this.publicPlayers(),
      teams: this.publicTeams(),
      question: this.publicQuestion(forHost || this.settings.showQuestionOnPlayer),
      reveal: showReveal ? this.reveal : null,
      leaderboard: this.leaderboard,
      finalRanking: forHost || finalPhase ? this.fullRanking() : null,
      answeredCount: this.status === 'question' ? this.answeredCount : 0,
      endReason: this.status === 'ended' ? this.endReason : null,
    }
  }

  /** Host snapshot: question text always, full ranking always. */
  hostSnapshot(): GameSnapshot {
    return this.baseSnapshot(true)
  }

  /** Player base (no `me`); reuse across players via `withMe`. */
  playerBase(): GameSnapshot {
    return this.baseSnapshot(false)
  }

  me(playerId: string): MePlayer | null {
    const p = this.players.get(playerId)
    if (!p) return null
    return {
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      rank: this.rankFor(p),
      hasAnswered: this.status === 'question' && p.answers.has(this.questionIndex),
      lastResult: p.lastResult,
      teamId: p.teamId,
    }
  }

  withMe(base: GameSnapshot, playerId: string): GameSnapshot {
    const me = this.me(playerId)
    return me ? { ...base, me } : base
  }

  snapshotFor(role: 'host' | string): GameSnapshot {
    if (role === 'host') return this.hostSnapshot()
    return this.withMe(this.playerBase(), role)
  }

  // ---------------------------------------------------------------------------
  // Result
  // ---------------------------------------------------------------------------

  buildResult(): GameResult {
    if (this.result) return this.result
    const scored: { index: number; q: Question }[] = []
    this.questions.forEach((q, index) => {
      if (q.type !== 'info') scored.push({ index, q })
    })
    const playersArr = [...this.players.values()]
    const questionStats: GameResultQuestionStat[] = scored.map(({ index, q }) => {
      let correct = 0
      let timeSum = 0
      let answered = 0
      for (const p of playersArr) {
        const a = p.answers.get(index)
        if (!a) continue
        answered += 1
        timeSum += a.answerTimeMs
        if (a.fraction > 0) correct += 1
      }
      return {
        questionIndex: index,
        text: q.text,
        type: q.type,
        correctPercent: playersArr.length ? Math.round((correct / playersArr.length) * 100) : 0,
        averageTimeMs: answered ? Math.round(timeSum / answered) : 0,
      }
    })
    const askedStats = questionStats.filter((s) => s.questionIndex <= this.questionIndex)
    const averageCorrectPercent = askedStats.length
      ? Math.round(askedStats.reduce((s, x) => s + x.correctPercent, 0) / askedStats.length)
      : 0
    let hardest: GameResultQuestionStat | null = null
    for (const s of askedStats)
      if (!hardest || s.correctPercent < hardest.correctPercent) hardest = s

    const ranked = rankPlayers(playersArr)
    const players: GameResultPlayer[] = ranked.map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      rank: p.rank,
      correctCount: scored.reduce(
        (n, { index }) => n + ((p.answers.get(index)?.fraction ?? 0) > 0 ? 1 : 0),
        0,
      ),
      answers: scored.map(({ index }) => {
        const a = p.answers.get(index)
        return {
          questionIndex: index,
          correct: (a?.fraction ?? 0) > 0,
          points: a?.points ?? 0,
          answerTimeMs: a ? a.answerTimeMs : null,
          optionIds: a ? a.optionIds : [],
          textAnswer: a?.text ?? null,
        }
      }),
    }))

    const result: GameResult = {
      id: randomUUID(),
      sessionId: this.sessionId,
      quizId: this.quizId,
      quizTitle: this.quizTitle,
      hostId: this.hostId,
      mode: this.settings.mode,
      pin: this.pin,
      startedAt: new Date(this.startedAt ?? this.createdAt).toISOString(),
      endedAt: new Date(this.endedAt ?? this.now()).toISOString(),
      playerCount: playersArr.length,
      averageCorrectPercent,
      hardestQuestionIndex: hardest ? hardest.questionIndex : null,
      questions: questionStats,
      players,
    }
    if (this.status === 'ended') this.result = result
    return result
  }

  /** Release timers (eviction). */
  dispose(): void {
    this.clearTimer()
  }
}
