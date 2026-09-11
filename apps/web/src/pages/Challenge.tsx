import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import {
  MAX_NICKNAME,
  validateNickname,
  type AnswerResult,
  type Challenge as ChallengeType,
  type LeaderboardEntry,
  type PublicQuestion,
} from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { Input } from '@/components/Field'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { TimerRing } from '@/components/TimerRing'
import { OptionButton } from '@/components/OptionButton'
import { Media } from '@/components/Media'
import { Leaderboard } from '@/components/Leaderboard'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useOptionLabel } from '@/hooks/useOptionLabel'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { api, ApiError, type ChallengeQuestionResponse } from '@/lib/api'
import { setClockOffset } from '@/lib/clock'
import { readJson, writeJson } from '@/lib/storage'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'

interface Attempt {
  attemptId: string
  token: string
  nickname: string
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'question'; data: ChallengeQuestionResponse }
  | {
      kind: 'reveal'
      question: PublicQuestion
      result: AnswerResult
      correctOptionIds: string[]
      acceptedAnswers: string[]
      finished: boolean
      chosen: string[]
    }
  | { kind: 'finished'; score: number; rank: number }

export default function Challenge() {
  const { t } = useTranslation()
  usePageTitle(t('titles.challenge'))
  const { code = '' } = useParams()
  const errorMessage = useErrorMessage()
  const locale = useSettingsStore((s) => s.locale)
  const [info, setInfo] = useState<
    { challenge: ChallengeType; questionCount: number; expired: boolean } | null | undefined
  >(undefined)
  const [attempt, setAttempt] = useState<Attempt | null>(() =>
    readJson<Attempt>('session', `kq.challenge.${code}`),
  )
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [showBoard, setShowBoard] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.challenges
      .get(code)
      .then((r) => {
        if (!cancelled) setInfo(r)
      })
      .catch(() => {
        if (!cancelled) setInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const wantBoard = Boolean(info?.expired) || showBoard
  useEffect(() => {
    if (!wantBoard) return
    let cancelled = false
    api.challenges
      .leaderboard(code)
      .then((r) => {
        if (!cancelled) setEntries(r.entries)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [wantBoard, code])

  const fetchQuestion = useCallback(
    async (a: Attempt) => {
      try {
        const r = await api.challenges.question(code, a.attemptId, a.token)
        if (r.finished) {
          setPhase({ kind: 'finished', score: r.score, rank: r.rank })
          setShowBoard(true)
        } else {
          setClockOffset(r.serverTime - Date.now())
          setPhase({ kind: 'question', data: r })
          playSound('questionStart')
        }
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [code, errorMessage],
  )

  // Resume an attempt after refresh (kicked off asynchronously once the challenge info is known).
  const canResume = Boolean(attempt) && phase.kind === 'intro' && Boolean(info) && !info?.expired
  useEffect(() => {
    if (!canResume || !attempt) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchQuestion(attempt)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canResume])

  const startAttempt = async (e: FormEvent) => {
    e.preventDefault()
    const v = validateNickname(nickname)
    if (!v.ok) {
      setError(t(`errors.${v.error}`))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await api.challenges.startAttempt(code, v.nickname)
      const a: Attempt = { attemptId: r.attemptId, token: r.token, nickname: r.nickname }
      writeJson('session', `kq.challenge.${code}`, a)
      setAttempt(a)
      await fetchQuestion(a)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const submitAnswer = async (payload: { optionIds?: string[]; text?: string } | null) => {
    if (!attempt || phase.kind !== 'question') return
    const q = phase.data.question
    setBusy(true)
    try {
      const r = await api.challenges.answer(code, attempt.attemptId, attempt.token, {
        questionIndex: q.index,
        ...(payload ?? {}),
      })
      playSound(r.result.correct ? 'correct' : 'incorrect')
      if (r.late || payload === null) toast.info(t('challenge.late'))
      setPhase({
        kind: 'reveal',
        question: q,
        result: r.result,
        correctOptionIds: r.correctOptionIds,
        acceptedAnswers: r.acceptedAnswers,
        finished: r.finished,
        chosen: payload?.optionIds ?? [],
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_ANSWERED') {
        toast.info(t('challenge.alreadyAnswered'))
        await fetchQuestion(attempt)
        return
      }
      toast.error(errorMessage(err))
    }
    setBusy(false)
  }

  if (info === undefined) {
    return (
      <AppShell>
        <PageSpinner />
      </AppShell>
    )
  }
  if (info === null) {
    return (
      <AppShell>
        <EmptyState title={t('challenge.notFound')} />
      </AppShell>
    )
  }

  const board = entries && (
    <section className="flex flex-col gap-3" data-testid="challenge-leaderboard">
      <h2 className="text-xl font-bold">{t('challenge.leaderboard')}</h2>
      {entries.length === 0 ? (
        <p className="text-fg-muted">{t('challenges.noEntries')}</p>
      ) : (
        <Leaderboard entries={entries} limit={20} size="player" />
      )}
    </section>
  )

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {phase.kind === 'intro' && (
          <div className="flex flex-col gap-4" data-testid="challenge-intro">
            <p className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
              {t('challenge.heading')}
            </p>
            <h1 className="text-3xl font-bold">{info.challenge.quizTitle}</h1>
            <p className="text-fg-muted">{t('challenge.intro')}</p>
            <ul className="flex flex-wrap gap-2 text-sm text-fg-muted">
              <li className="rounded-full border border-line px-3 py-1">
                {t('challenge.deadline', { date: formatDate(info.challenge.deadline, locale) })}
              </li>
              <li className="rounded-full border border-line px-3 py-1">
                {t('challenge.questions', { count: info.questionCount })}
              </li>
            </ul>
            {info.expired ? (
              <>
                <EmptyState title={t('challenge.expired')} text={t('challenge.expiredHint')} />
                {board}
              </>
            ) : attempt ? (
              <PageSpinner />
            ) : (
              <form
                onSubmit={(e) => void startAttempt(e)}
                noValidate
                className="card flex flex-col gap-4 p-5"
              >
                <Input
                  label={t('challenge.nickname')}
                  value={nickname}
                  maxLength={MAX_NICKNAME}
                  onChange={(e) => {
                    setNickname(e.target.value)
                    setError(null)
                  }}
                  error={error}
                  autoComplete="nickname"
                  data-testid="challenge-nickname"
                />
                <Button type="submit" size="lg" loading={busy} data-testid="challenge-start">
                  {busy ? t('challenge.starting') : t('challenge.start')}
                </Button>
              </form>
            )}
          </div>
        )}

        {phase.kind === 'question' && (
          <QuestionView data={phase.data} busy={busy} onSubmit={submitAnswer} />
        )}

        {phase.kind === 'reveal' && (
          <RevealView
            phase={phase}
            onNext={() => {
              if (!attempt) return
              setBusy(true)
              void fetchQuestion(attempt)
            }}
            busy={busy}
          />
        )}

        {phase.kind === 'finished' && (
          <div
            className="flex flex-col items-center gap-4 text-center"
            data-testid="challenge-finished"
          >
            <h1 className="text-3xl font-bold">{t('challenge.finished')}</h1>
            <p className="font-heading text-6xl font-extrabold text-amber tabular">{phase.score}</p>
            <p className="text-fg-muted">{t('challenge.yourRank', { rank: phase.rank })}</p>
            {board}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function QuestionView({
  data,
  busy,
  onSubmit,
}: {
  data: ChallengeQuestionResponse
  busy: boolean
  onSubmit: (p: { optionIds?: string[]; text?: string } | null) => void
}) {
  const { t } = useTranslation()
  const optionLabel = useOptionLabel()
  const q = data.question
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const multiple = q.type === 'multiple'
  const onDone = useCallback(() => onSubmit(null), [onSubmit])

  return (
    <div className="flex flex-col gap-5" data-testid="challenge-question">
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-bg-elev px-4 py-1.5 text-sm font-semibold text-fg-muted">
          {t('play.questionOf', { index: q.index + 1, total: q.total })}
        </span>
        <div className="ml-auto">
          {q.type !== 'info' && (
            <TimerRing
              deadline={data.deadline}
              startedAt={data.startedAt}
              size={80}
              onDone={onDone}
            />
          )}
        </div>
      </div>
      <h1 className="font-heading text-2xl leading-snug font-bold break-words [overflow-wrap:anywhere] sm:text-3xl">
        {q.text}
      </h1>
      {q.mediaUrl && <Media url={q.mediaUrl} className="max-h-72" />}
      {q.type === 'info' ? (
        <Button size="lg" onClick={() => onSubmit(null)} loading={busy} className="self-end">
          {t('challenge.next')}
        </Button>
      ) : q.type === 'text' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) onSubmit({ text: text.trim() })
          }}
        >
          <label htmlFor="challenge-text" className="text-sm font-semibold text-fg-muted">
            {t('play.textLabel')}
          </label>
          <input
            id="challenge-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('play.textPlaceholder')}
            maxLength={200}
            autoComplete="off"
            autoFocus
            data-testid="challenge-text"
            className="h-14 rounded-2xl border-2 border-line bg-bg-elev px-4 text-xl focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60"
          />
          <Button
            type="submit"
            size="lg"
            disabled={!text.trim()}
            loading={busy}
            className="self-end"
          >
            {t('challenge.submit')}
          </Button>
        </form>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {q.options.map((o) => (
              <OptionButton
                key={o.id}
                index={o.index}
                text={optionLabel(q.type, o.text)}
                selected={selected.includes(o.id)}
                disabled={busy}
                role={multiple ? 'checkbox' : 'radio'}
                onClick={() => {
                  if (multiple)
                    setSelected((s) =>
                      s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id],
                    )
                  else onSubmit({ optionIds: [o.id] })
                }}
              />
            ))}
          </div>
          {multiple && (
            <Button
              size="lg"
              disabled={selected.length === 0}
              loading={busy}
              onClick={() => onSubmit({ optionIds: selected })}
              className="self-end"
            >
              {t('challenge.submit')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function RevealView({
  phase,
  onNext,
  busy,
}: {
  phase: Extract<Phase, { kind: 'reveal' }>
  onNext: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const optionLabel = useOptionLabel()
  const q = phase.question
  const correct = new Set(phase.correctOptionIds)
  const chosen = new Set(phase.chosen)
  return (
    <div className="flex flex-col gap-5" data-testid="challenge-reveal">
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl px-5 py-4',
          phase.result.correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error',
        )}
      >
        {phase.result.correct ? (
          <Check className="size-7" aria-hidden="true" />
        ) : (
          <X className="size-7" aria-hidden="true" />
        )}
        <span className="text-xl font-bold">
          {phase.result.correct ? t('play.correct') : t('play.incorrect')}
        </span>
        <span className="ml-auto font-heading text-2xl font-extrabold tabular">
          {t('play.pointsEarned', { points: phase.result.points })}
        </span>
      </div>
      <h1 className="font-heading text-2xl font-bold">{q.text}</h1>
      {q.type === 'text' ? (
        <p className="text-fg-muted">
          {t('play.correctAnswersWere')}:{' '}
          <span className="font-semibold text-fg">{phase.acceptedAnswers.join(' · ')}</span>
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((o) => (
            <OptionButton
              key={o.id}
              index={o.index}
              text={optionLabel(q.type, o.text)}
              selected={chosen.has(o.id)}
              disabled
              outcome={
                correct.has(o.id)
                  ? chosen.has(o.id)
                    ? 'correct'
                    : 'missed'
                  : chosen.has(o.id)
                    ? 'incorrect'
                    : null
              }
            />
          ))}
        </div>
      )}
      <p className="text-fg-muted">
        {t('play.score', { score: phase.result.score })} ·{' '}
        {t('play.rank', { rank: phase.result.rank })}
      </p>
      <Button
        size="lg"
        onClick={onNext}
        loading={busy}
        className="self-end"
        data-testid="challenge-next"
      >
        {phase.finished ? t('challenge.showLeaderboard') : t('challenge.next')}
      </Button>
    </div>
  )
}
