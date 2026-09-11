import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, Flame, UserX } from 'lucide-react'
// Type-only imports keep zod (re-exported by the shared index) out of the player bundle.
import type { GameSnapshot, PublicQuestion } from '@kontext/shared'
import { PlayerShell } from '@/components/PlayerShell'
import { Countdown } from '@/components/Countdown'
import { AnimalAvatar } from '@/components/AnimalAvatar'
import { TimerRing } from '@/components/TimerRing'
import { OptionButton } from '@/components/OptionButton'
import { Media } from '@/components/Media'
import { Button } from '@/components/Button'
import { ErrorScreen } from '@/components/ErrorScreen'
import { Spinner } from '@/components/Spinner'
import { shapeFor } from '@/components/shapes'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCountdown } from '@/hooks/useCountdown'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useOptionLabel } from '@/hooks/useOptionLabel'
import { useGameErrorToasts, usePhaseAnnouncer } from '@/hooks/useGameFeedback'
import { useGameStore } from '@/stores/gameStore'
import { announce } from '@/stores/announcerStore'
import { toast } from '@/stores/toastStore'
import { playSound } from '@/lib/sound'
import { fireConfetti } from '@/lib/confetti'
import { serverNow } from '@/lib/clock'
import { cn } from '@/lib/cn'

export default function Play() {
  const { t } = useTranslation()
  usePageTitle(t('titles.play'))
  const navigate = useNavigate()
  const snapshot = useGameStore((s) => s.snapshot)
  const role = useGameStore((s) => s.role)
  const kicked = useGameStore((s) => s.kicked)
  const resumeFailed = useGameStore((s) => s.resumeFailed)
  const nickname = useGameStore((s) => s.nickname)
  const resumePlayer = useGameStore((s) => s.resumePlayer)
  const hasStored = useGameStore((s) => s.hasStoredPlayerSession)
  const leave = useGameStore((s) => s.leave)
  const stored = hasStored()

  usePhaseAnnouncer(snapshot)
  useGameErrorToasts()

  useEffect(() => {
    if (role === 'player' && snapshot) return
    if (stored) void resumePlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goHome = () => {
    leave()
    navigate('/')
  }

  if (kicked) {
    return (
      <PlayerShell>
        <ErrorScreen
          icon={<UserX className="size-12" />}
          title={t('play.kickedTitle')}
          text={t('play.kickedText')}
          actionLabel={t('play.kickedAction')}
          onAction={goHome}
          testId="kicked-screen"
        />
      </PlayerShell>
    )
  }
  if (resumeFailed) {
    return (
      <PlayerShell>
        <ErrorScreen
          title={t('play.resumeFailedTitle')}
          text={t('play.resumeFailedText')}
          actionLabel={t('app.home')}
          onAction={goHome}
          testId="resume-failed"
        />
      </PlayerShell>
    )
  }
  if (!snapshot) {
    if (!stored && role !== 'player') {
      return (
        <PlayerShell>
          <ErrorScreen
            title={t('play.noSessionTitle')}
            text={t('play.noSessionText')}
            actionLabel={t('app.home')}
            onAction={goHome}
            testId="no-session"
          />
        </PlayerShell>
      )
    }
    return (
      <PlayerShell>
        <div className="flex flex-1 items-center justify-center">
          <Spinner label={t('app.connecting')} />
        </div>
      </PlayerShell>
    )
  }

  const me = snapshot.me
  const status = (
    <span className="flex items-center gap-2" data-testid="player-status">
      {me?.avatar && <AnimalAvatar avatar={me.avatar} size="sm" />}
      <span className="truncate font-semibold text-fg">{me?.nickname ?? nickname}</span>
      {me && snapshot.status !== 'lobby' && (
        <span className="font-heading tabular text-amber" data-testid="player-score">
          {me.score}
        </span>
      )}
    </span>
  )

  return (
    <PlayerShell status={status}>
      <Screen snapshot={snapshot} onLeave={goHome} />
    </PlayerShell>
  )
}

function Screen({ snapshot, onLeave }: { snapshot: GameSnapshot; onLeave: () => void }) {
  const { t } = useTranslation()
  switch (snapshot.status) {
    case 'lobby':
      return <Lobby snapshot={snapshot} />
    case 'get_ready':
      return (
        <Countdown
          endsAt={snapshot.deadline}
          label={`${t('play.getReady')} · ${t('play.questionOf', { index: snapshot.questionIndex + 1, total: snapshot.questionCount })}`}
        />
      )
    case 'question':
      return snapshot.question ? (
        <Question key={snapshot.question.id} snapshot={snapshot} question={snapshot.question} />
      ) : null
    case 'reveal':
      return <Reveal key={snapshot.questionIndex} snapshot={snapshot} />
    case 'leaderboard':
      return <PlayerLeaderboard snapshot={snapshot} />
    case 'podium':
      return <Final snapshot={snapshot} onLeave={onLeave} />
    case 'ended':
      return snapshot.endReason === 'cancelled' ? (
        <Cancelled onLeave={onLeave} />
      ) : (
        <Final snapshot={snapshot} onLeave={onLeave} />
      )
  }
}

/** The host closed the room before the game was played to the end. */
function Cancelled({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
      data-testid="player-cancelled"
    >
      <h1 className="text-3xl font-bold">{t('play.cancelledTitle')}</h1>
      <p className="text-lg text-fg-muted">{t('play.cancelledText')}</p>
      <Button size="lg" onClick={onLeave} data-testid="play-again">
        {t('play.playAgain')}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Lobby({ snapshot }: { snapshot: GameSnapshot }) {
  const { t } = useTranslation()
  const switchTeam = useGameStore((s) => s.switchTeam)
  const me = snapshot.me
  const isTeam = snapshot.settings.mode === 'team'
  const myTeam = isTeam ? snapshot.teams.find((tm) => tm.id === me?.teamId) : null
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      data-testid="player-lobby"
    >
      {me?.avatar ? (
        <span className="relative inline-flex animate-pop-in">
          <AnimalAvatar avatar={me.avatar} size="xl" label={me.nickname} />
          <span
            className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-teal text-fg-on-accent ring-4 ring-bg"
            aria-hidden="true"
          >
            <Check className="size-5" />
          </span>
        </span>
      ) : (
        <div
          className="flex size-24 animate-pop-in items-center justify-center rounded-full bg-teal/20 text-teal"
          aria-hidden="true"
        >
          <Check className="size-12" />
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold">{t('play.lobbyTitle')}</h1>
        <p className="mt-2 text-fg-muted">{t('play.lobbyHint')}</p>
      </div>
      <p className="font-heading text-xl" data-testid="lobby-nickname">
        {t('play.youAre', { nickname: me?.nickname ?? '' })}
      </p>
      {isTeam && (
        <section className="flex w-full max-w-sm flex-col gap-2" aria-label={t('play.pickTeam')}>
          <h2 className="text-sm font-semibold text-fg-muted">
            {myTeam ? t('play.yourTeam') : t('play.pickTeam')}
          </h2>
          <ul className="flex flex-col gap-2">
            {snapshot.teams.map((team) => {
              const mine = team.id === me?.teamId
              const full = team.memberIds.length >= snapshot.settings.teamSize
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    disabled={mine || full}
                    aria-pressed={mine}
                    onClick={() => void switchTeam(team.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left',
                      'focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none',
                      mine ? 'border-teal bg-teal/15' : 'border-line bg-bg-elev',
                      full && !mine && 'opacity-50',
                    )}
                  >
                    <span className="font-semibold">{team.name}</span>
                    <span className="text-sm text-fg-muted">
                      {t('game.teamMembers', { count: team.memberIds.length })}
                      {full && !mine ? ` · ${t('play.teamFull')}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <p className="animate-pulse text-fg-muted">{t('play.waitingStart')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Question({ snapshot, question }: { snapshot: GameSnapshot; question: PublicQuestion }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const errorMessage = useErrorMessage()
  const optionLabel = useOptionLabel()
  const answer = useGameStore((s) => s.answer)
  const answered = useGameStore((s) => s.answeredThisQuestion) || Boolean(snapshot.me?.hasAnswered)
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const discussion = useCountdown(snapshot.discussionUntil)
  const locked =
    snapshot.settings.mode === 'team' && snapshot.discussionUntil != null && !discussion.done
  // The server still accepts answers for a short grace window; the UI closes at the visible deadline.
  const timer = useCountdown(snapshot.deadline)
  const timeUp = snapshot.deadline != null && timer.done && serverNow() > snapshot.deadline
  const showText = question.text != null

  const submit = async (payload: { optionIds?: string[]; text?: string }) => {
    if (busy || answered) return
    setBusy(true)
    try {
      await answer(payload)
      announce(t('a11y.answered'))
    } catch (err) {
      toast.error(t('play.answerRejected', { reason: errorMessage(err) }))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg-muted" data-testid="question-progress">
          {t('play.questionOf', { index: question.index + 1, total: question.total })}
        </p>
        {showText ? (
          <h1
            className="text-lg leading-snug font-bold break-words [overflow-wrap:anywhere]"
            data-testid="player-question-text"
          >
            {question.text}
          </h1>
        ) : (
          <h1 className="text-base text-fg-muted">{t('play.lookAtScreen')}</h1>
        )}
      </div>
      {snapshot.deadline != null && (
        <TimerRing
          deadline={snapshot.deadline}
          startedAt={snapshot.discussionUntil ?? snapshot.questionStartedAt}
          size={64}
          ticks
        />
      )}
    </div>
  )

  if (question.type === 'info') {
    return (
      <div className="flex flex-1 flex-col gap-3" data-testid="player-info">
        {header}
        {showText && <Media url={question.mediaUrl} className="max-h-60" />}
        <p className="flex flex-1 items-center justify-center text-center text-xl text-fg-muted">
          {t('play.infoSlide')}
        </p>
      </div>
    )
  }

  if (answered) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        {header}
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          data-testid="answer-accepted"
        >
          <div
            className="flex size-24 animate-count-in items-center justify-center rounded-full bg-success/20 text-success"
            aria-hidden="true"
          >
            <Check className="size-12" />
          </div>
          <h2 className="text-2xl font-bold">{t('play.answered')}</h2>
          <p className="animate-pulse text-fg-muted">{t('play.waitingOthers')}</p>
        </div>
      </div>
    )
  }

  if (timeUp) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        {header}
        <div
          className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
          data-testid="time-up"
        >
          <h2 className="text-2xl font-bold">{t('play.timeUp')}</h2>
          <p className="text-fg-muted">{t('play.waitingHost')}</p>
        </div>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        {header}
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
          data-testid="discussion"
        >
          <span className="font-heading text-6xl font-extrabold text-amber tabular">
            {discussion.seconds}
          </span>
          <h2 className="text-2xl font-bold">{t('play.discussion')}</h2>
          <p className="text-fg-muted">{t('play.discussionHint')}</p>
        </div>
      </div>
    )
  }

  if (question.type === 'text') {
    return (
      <form
        className="flex flex-1 flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) void submit({ text: text.trim() })
        }}
      >
        {header}
        {showText && <Media url={question.mediaUrl} className="max-h-48" />}
        <div className="flex flex-1 flex-col justify-center gap-3">
          <label htmlFor="text-answer" className="text-sm font-semibold text-fg-muted">
            {t('play.textLabel')}
          </label>
          <input
            id="text-answer"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('play.textPlaceholder')}
            maxLength={200}
            autoFocus
            autoComplete="off"
            enterKeyHint="send"
            data-testid="text-answer"
            className="h-16 w-full rounded-2xl border-2 border-line bg-bg-elev px-4 text-2xl focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60"
          />
        </div>
        <Button
          type="submit"
          size="xl"
          block
          loading={busy}
          disabled={!text.trim()}
          data-testid="submit-answer"
        >
          {t('play.submit')}
        </Button>
      </form>
    )
  }

  const multiple = question.type === 'multiple'
  // Phones get a vertical list (easier to read and tap one-handed); tablets and up get the 2×2 grid.
  const cols = question.options.length <= 2 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="flex flex-1 flex-col gap-3">
      {header}
      {showText && question.mediaUrl && <Media url={question.mediaUrl} className="max-h-40" />}
      <p className="sr-only">{multiple ? t('play.selectMany') : t('play.selectOne')}</p>
      <div
        className={cn('grid min-h-0 flex-1 auto-rows-fr gap-3', cols)}
        role={multiple ? 'group' : 'radiogroup'}
        data-testid="answer-grid"
      >
        {question.options.map((o, i) => (
          <div
            key={o.id}
            className="flex min-h-11 animate-pop-in"
            style={{ animationDelay: reduced ? '0ms' : `${i * 60}ms` }}
          >
            <OptionButton
              index={o.index}
              text={optionLabel(question.type, o.text)}
              showText={showText}
              selected={selected.includes(o.id)}
              disabled={busy}
              role={multiple ? 'checkbox' : 'radio'}
              className="h-full"
              onClick={() => {
                if (multiple) toggle(o.id)
                else void submit({ optionIds: [o.id] })
              }}
            />
          </div>
        ))}
      </div>
      {multiple && (
        <Button
          size="xl"
          block
          loading={busy}
          disabled={selected.length === 0}
          onClick={() => void submit({ optionIds: selected })}
          data-testid="submit-answer"
        >
          {t('play.submit')}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Counts from 0 to `target` once per mount (the reveal screen remounts per question). */
function useCountUp(target: number, duration = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced || target === 0 ? target : 0)
  useEffect(() => {
    if (reduced || target === 0) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])
  return value
}

function Reveal({ snapshot }: { snapshot: GameSnapshot }) {
  const { t } = useTranslation()
  const optionLabel = useOptionLabel()
  const me = snapshot.me
  const result =
    me?.lastResult && me.lastResult.questionIndex === snapshot.questionIndex ? me.lastResult : null
  const points = useCountUp(result?.points ?? 0)
  const played = useRef(false)
  const question = snapshot.question
  const reveal = snapshot.reveal

  useEffect(() => {
    if (played.current) return
    played.current = true
    if (result?.correct) {
      playSound('correct')
      announce(t('a11y.resultCorrect', { points: result.points }))
    } else {
      playSound('incorrect')
      announce(t('a11y.resultIncorrect'))
    }
  }, [result, t])

  const outcome: 'correct' | 'partial' | 'incorrect' | 'none' =
    !result || !result.answered
      ? 'none'
      : result.correct && result.fraction >= 1
        ? 'correct'
        : result.correct
          ? 'partial'
          : 'incorrect'

  const correctOptions = useMemo(() => {
    if (!question || !reveal) return []
    const ids = new Set(reveal.correctOptionIds)
    return question.options.filter((o) => ids.has(o.id))
  }, [question, reveal])

  const tone = {
    correct: 'bg-success/15 text-success',
    partial: 'bg-amber/15 text-amber',
    incorrect: 'bg-error/15 text-error',
    none: 'bg-fg/10 text-fg-muted',
  }[outcome]
  const title = {
    correct: t('play.correct'),
    partial: t('play.partial'),
    incorrect: t('play.incorrect'),
    none: t('play.noAnswer'),
  }[outcome]

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
      data-testid="player-reveal"
      data-outcome={outcome}
    >
      <div
        className={cn(
          'flex w-full max-w-sm animate-count-in flex-col items-center gap-2 rounded-3xl px-6 py-8',
          tone,
        )}
      >
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="font-heading text-6xl font-extrabold tabular" data-testid="points-earned">
          {t('play.pointsEarned', { points })}
        </p>
        {result && result.streak >= 2 && (
          <p
            className="inline-flex items-center gap-1 rounded-full bg-bg/60 px-3 py-1 text-sm font-bold text-fg"
            data-testid="streak"
          >
            <Flame className="size-4 text-coral" aria-hidden="true" />
            {t('play.streak', { count: result.streak })}
          </p>
        )}
      </div>
      {me && (
        <div className="flex gap-6 text-fg-muted">
          <span data-testid="reveal-rank">{t('play.rank', { rank: result?.rank ?? me.rank })}</span>
          <span data-testid="reveal-score">
            {t('play.score', { score: result?.score ?? me.score })}
          </span>
        </div>
      )}
      {question && reveal && (
        <section
          className="flex w-full max-w-sm flex-col gap-2"
          aria-label={t('play.correctAnswerWas')}
        >
          <h2 className="text-sm font-semibold text-fg-muted">
            {question.type === 'text' || correctOptions.length > 1
              ? t('play.correctAnswersWere')
              : t('play.correctAnswerWas')}
          </h2>
          {question.type === 'text' ? (
            <p className="rounded-2xl border border-line bg-bg-elev px-4 py-3 font-semibold">
              {reveal.acceptedAnswers.join(' · ')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {correctOptions.map((o) => {
                const shape = shapeFor(o.index)
                return (
                  <li
                    key={o.id}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3',
                      shape.bg,
                      shape.onBg,
                    )}
                  >
                    <shape.Icon className="size-6 shrink-0" />
                    <span className="font-semibold">
                      {question.text != null
                        ? optionLabel(question.type, o.text)
                        : t(`shapes.${shape.name}`)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function PlayerLeaderboard({ snapshot }: { snapshot: GameSnapshot }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const me = snapshot.me
  const rows = snapshot.leaderboard.slice(0, 5)
  const myId = snapshot.settings.mode === 'team' ? me?.teamId : me?.id
  return (
    <div className="flex flex-1 flex-col gap-4 py-2" data-testid="player-leaderboard">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t('play.leaderboard')}</h1>
        {me && (
          <p className="text-fg-muted" data-testid="my-rank">
            {t('play.yourRank', { rank: me.rank })}
          </p>
        )}
      </div>
      <h2 className="text-sm font-semibold text-fg-muted">{t('play.top5')}</h2>
      <ol className="flex flex-col gap-2">
        {rows.map((e, i) => (
          <li
            key={e.playerId}
            style={{ animationDelay: reduced ? '0ms' : `${i * 60}ms` }}
            className={cn(
              'flex animate-slide-in items-center gap-3 rounded-2xl border border-line bg-bg-elev px-4 py-3',
              e.playerId === myId && 'border-amber',
            )}
          >
            <span className="font-heading w-7 text-xl font-extrabold tabular text-amber">
              {e.rank}
            </span>
            {e.avatar && <AnimalAvatar avatar={e.avatar} size="sm" />}
            <span className="min-w-0 flex-1 truncate font-semibold">{e.nickname}</span>
            <span className="font-heading font-bold tabular">{e.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Final({ snapshot, onLeave }: { snapshot: GameSnapshot; onLeave: () => void }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const me = snapshot.me
  const isTeam = snapshot.settings.mode === 'team'
  const ranking = snapshot.finalRanking ?? snapshot.leaderboard
  const entry = ranking.find((e) => e.playerId === (isTeam ? me?.teamId : me?.id)) ?? null
  const teamEntry = isTeam ? entry : null
  const rank = entry?.rank ?? me?.rank ?? 0
  const score = entry?.score ?? me?.score ?? 0
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !rank) return
    fired.current = true
    if (rank <= 3) {
      playSound('fanfare')
      if (!reduced) void fireConfetti('burst')
    }
  }, [rank, reduced])

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
      data-testid="player-final"
    >
      <h1 className="text-3xl font-bold">{t('play.podiumTitle')}</h1>
      <div className="flex animate-count-in flex-col items-center gap-1 rounded-3xl bg-bg-elev px-10 py-8">
        <span
          className="font-heading text-7xl font-extrabold text-amber tabular"
          data-testid="final-rank"
        >
          #{rank || '–'}
        </span>
        <span className="text-xl font-semibold">{t('play.finalRank', { rank })}</span>
        <span className="text-fg-muted" data-testid="final-score">
          {t('play.finalScore', { score })}
        </span>
        {isTeam && teamEntry && <span className="text-sm text-fg-muted">{teamEntry.nickname}</span>}
      </div>
      <p className="text-lg">
        {rank === 1
          ? t('play.champion')
          : rank <= 3 && rank > 0
            ? t('play.top3')
            : t('play.thanks')}
      </p>
      <Button size="lg" onClick={onLeave} data-testid="play-again">
        {t('play.playAgain')}
      </Button>
    </div>
  )
}
