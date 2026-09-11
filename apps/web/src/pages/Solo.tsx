import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import type { Quiz } from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { TimerRing } from '@/components/TimerRing'
import { OptionButton } from '@/components/OptionButton'
import { Media } from '@/components/Media'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useOptionLabel } from '@/hooks/useOptionLabel'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { isLocalId } from '@/lib/ids'
import { localRepo } from '@/lib/quizRepo'
import { serverNow } from '@/lib/clock'
import { playSound } from '@/lib/sound'
import { fireConfetti } from '@/lib/confetti'
import {
  advance,
  answer,
  createSolo,
  currentQuestion,
  start,
  summary,
  type SoloState,
} from '@/lib/soloEngine'
import { cn } from '@/lib/cn'

export default function Solo() {
  const { t } = useTranslation()
  usePageTitle(t('titles.solo'))
  const { quizId = '' } = useParams()
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined)

  useEffect(() => {
    if (authStatus === 'idle' || authStatus === 'loading') return
    let cancelled = false
    const load = async (): Promise<Quiz | null> => {
      if (isLocalId(quizId)) return localRepo.get(quizId)
      try {
        return (await api.quizzes.get(quizId)).quiz
      } catch {
        return user ? null : localRepo.get(quizId)
      }
    }
    void load().then((q) => {
      if (!cancelled) setQuiz(q)
    })
    return () => {
      cancelled = true
    }
  }, [quizId, user, authStatus])

  if (quiz === undefined) {
    return (
      <AppShell>
        <PageSpinner />
      </AppShell>
    )
  }
  if (!quiz) {
    return (
      <AppShell>
        <EmptyState
          title={t('solo.notFound')}
          action={
            <Link to="/host" className="font-semibold underline">
              {t('solo.toDashboard')}
            </Link>
          }
        />
      </AppShell>
    )
  }
  if (quiz.questions.length === 0) {
    return (
      <AppShell>
        <EmptyState
          title={t('solo.noQuestions')}
          action={
            <Link to="/host" className="font-semibold underline">
              {t('solo.toDashboard')}
            </Link>
          }
        />
      </AppShell>
    )
  }
  return (
    <AppShell>
      <SoloGame quiz={quiz} />
    </AppShell>
  )
}

function SoloGame({ quiz }: { quiz: Quiz }) {
  const { t } = useTranslation()
  const optionLabel = useOptionLabel()
  const reduced = useReducedMotion()
  const [state, setState] = useState<SoloState>(() => createSolo(quiz))
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const q = currentQuestion(state)

  const submit = useCallback((payload: { optionIds?: string[]; text?: string } | null) => {
    setState((s) => {
      const next = answer(s, payload, serverNow())
      if (next.phase === 'reveal') playSound(next.last?.correct ? 'correct' : 'incorrect')
      return next
    })
  }, [])

  const next = () => {
    setSelected([])
    setText('')
    setState((s) => {
      const n = advance(s, serverNow())
      if (n.phase === 'question') playSound('questionStart')
      return n
    })
  }

  const onTimeout = useCallback(() => submit(null), [submit])

  useEffect(() => {
    if (state.phase === 'finished' && !reduced) void fireConfetti('burst')
  }, [state.phase, reduced])

  if (state.phase === 'intro') {
    return (
      <div
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-10 text-center"
        data-testid="solo-intro"
      >
        <p className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
          {t('solo.heading')}
        </p>
        <h1 className="text-3xl font-bold">{quiz.title}</h1>
        <p className="text-fg-muted">{t('solo.intro')}</p>
        <p className="text-fg-muted">{t('count.questions', { count: quiz.questions.length })}</p>
        <Button
          size="xl"
          onClick={() => {
            setState(start(state, serverNow()))
            playSound('questionStart')
          }}
          data-testid="solo-start"
        >
          {t('solo.start')}
        </Button>
      </div>
    )
  }

  if (state.phase === 'finished') {
    const sum = summary(state)
    return (
      <div
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 py-10 text-center"
        data-testid="solo-result"
      >
        <h1 className="text-3xl font-bold">{t('solo.resultTitle')}</h1>
        <motion.p
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="font-heading text-7xl font-extrabold text-amber tabular"
          data-testid="solo-score"
        >
          {sum.score}
        </motion.p>
        <p className="text-fg-muted">{t('solo.totalScore')}</p>
        <p className="text-xl">
          {t('solo.correctOf', { correct: sum.correct, total: sum.scored })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            size="lg"
            onClick={() => {
              setState(start(createSolo(quiz), serverNow()))
              playSound('questionStart')
            }}
          >
            {t('solo.again')}
          </Button>
          <Link
            to="/host"
            className="inline-flex h-14 items-center rounded-2xl border border-line bg-bg-elev-2 px-6 text-lg font-semibold"
          >
            {t('solo.toDashboard')}
          </Link>
        </div>
      </div>
    )
  }

  if (!q) return null
  const reveal = state.phase === 'reveal'
  const last = state.last
  const correctIds = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id))
  const chosen = new Set(last?.optionIds ?? selected)
  const multiple = q.type === 'multiple'

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-5"
      data-testid="solo-question"
      data-phase={state.phase}
    >
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-bg-elev px-4 py-1.5 text-sm font-semibold text-fg-muted">
          {t('play.questionOf', { index: state.index + 1, total: state.questions.length })}
        </span>
        <span
          className="rounded-full bg-bg-elev px-4 py-1.5 font-heading text-sm tabular"
          data-testid="solo-running-score"
        >
          {state.score}
        </span>
        <div className="ml-auto">
          {state.phase === 'question' && state.deadline != null && (
            <TimerRing
              deadline={state.deadline}
              startedAt={state.startedAt}
              size={80}
              onDone={onTimeout}
            />
          )}
        </div>
      </div>
      <h1 className="font-heading text-2xl leading-snug font-bold break-words [overflow-wrap:anywhere] sm:text-3xl">
        {q.text}
      </h1>
      {q.mediaUrl && <Media url={q.mediaUrl} className="max-h-72" />}

      {reveal && last && (
        <motion.div
          initial={reduced ? false : { y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            'flex items-center gap-3 rounded-2xl px-5 py-4',
            last.correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error',
          )}
          data-testid="solo-reveal"
        >
          {last.correct ? (
            <Check className="size-7" aria-hidden="true" />
          ) : (
            <X className="size-7" aria-hidden="true" />
          )}
          <span className="text-xl font-bold">
            {last.correct
              ? last.fraction < 1
                ? t('play.partial')
                : t('play.correct')
              : t('play.incorrect')}
          </span>
          <span className="ml-auto font-heading text-2xl font-extrabold tabular">
            {t('play.pointsEarned', { points: last.points })}
          </span>
        </motion.div>
      )}

      {q.type === 'info' ? (
        <p className="text-fg-muted">{t('play.infoSlide')}</p>
      ) : q.type === 'text' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reveal && text.trim()) submit({ text: text.trim() })
          }}
        >
          <label htmlFor="solo-text" className="text-sm font-semibold text-fg-muted">
            {t('play.textLabel')}
          </label>
          <input
            id="solo-text"
            type="text"
            value={text}
            disabled={reveal}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('play.textPlaceholder')}
            maxLength={200}
            autoComplete="off"
            data-testid="solo-text"
            className="h-14 rounded-2xl border-2 border-line bg-bg-elev px-4 text-xl focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60"
          />
          {reveal ? (
            <p className="text-fg-muted">
              {t('play.correctAnswersWere')}:{' '}
              <span className="font-semibold text-fg">
                {q.options.map((o) => o.text).join(' · ')}
              </span>
            </p>
          ) : (
            <Button type="submit" size="lg" disabled={!text.trim()} data-testid="solo-submit">
              {t('play.submit')}
            </Button>
          )}
        </form>
      ) : (
        <div
          className={cn(
            'grid gap-3',
            q.options.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2',
          )}
        >
          {q.options.map((o, i) => (
            <OptionButton
              key={o.id}
              index={i}
              text={optionLabel(q.type, o.text)}
              selected={chosen.has(o.id)}
              disabled={reveal}
              outcome={
                reveal
                  ? correctIds.has(o.id)
                    ? chosen.has(o.id)
                      ? 'correct'
                      : 'missed'
                    : chosen.has(o.id)
                      ? 'incorrect'
                      : null
                  : null
              }
              role={multiple ? 'checkbox' : 'radio'}
              onClick={
                reveal
                  ? undefined
                  : () => {
                      if (multiple)
                        setSelected((s) =>
                          s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id],
                        )
                      else submit({ optionIds: [o.id] })
                    }
              }
            />
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!reveal && multiple && (
          <Button
            size="lg"
            disabled={selected.length === 0}
            onClick={() => submit({ optionIds: selected })}
            data-testid="solo-submit"
          >
            {t('play.submit')}
          </Button>
        )}
        {!reveal && q.type !== 'info' && q.type !== 'text' && !multiple ? null : null}
        {(reveal || q.type === 'info') && (
          <Button size="lg" onClick={reveal ? next : () => submit(null)} data-testid="solo-next">
            {state.index + 1 >= state.questions.length && reveal
              ? t('solo.finish')
              : t('solo.next')}
          </Button>
        )}
        {!reveal && q.type !== 'info' && (
          <Button size="lg" variant="ghost" onClick={() => submit(null)} data-testid="solo-skip">
            {t('solo.skip')}
          </Button>
        )}
      </div>
    </div>
  )
}
