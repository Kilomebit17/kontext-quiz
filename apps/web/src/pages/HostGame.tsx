import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Check,
  ChevronRight,
  Copy,
  DoorOpen,
  Download,
  Maximize2,
  Minimize2,
  Users,
  X,
} from 'lucide-react'
import type { GameSnapshot, GameResult, PublicQuestion } from '@kontext/shared'
import { formatPin } from '@kontext/shared'
import { Wordmark } from '@/components/Wordmark'
import { SoundToggle } from '@/components/SoundToggle'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { ConnectionBanner } from '@/components/ConnectionBanner'
import { Countdown } from '@/components/Countdown'
import { AnimalAvatar } from '@/components/AnimalAvatar'
import { TimerRing } from '@/components/TimerRing'
import { OptionButton } from '@/components/OptionButton'
import { Media } from '@/components/Media'
import { Button } from '@/components/Button'
import { Leaderboard } from '@/components/Leaderboard'
import { Podium } from '@/components/Podium'
import { RevealChart } from '@/components/RevealChart'
import { ResultsTable } from '@/components/ResultsTable'
import { fromRanking, type ResultRow } from '@/lib/results'
import { ErrorScreen } from '@/components/ErrorScreen'
import { Spinner } from '@/components/Spinner'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useCountdown } from '@/hooks/useCountdown'
import { useHotkey } from '@/hooks/useHotkey'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useOptionLabel } from '@/hooks/useOptionLabel'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useGameErrorToasts, usePhaseAnnouncer } from '@/hooks/useGameFeedback'
import { readHostSession, useGameStore } from '@/stores/gameStore'
import { toast } from '@/stores/toastStore'
import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/download'
import { copyText } from '@/lib/format'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/cn'

const NEXT_KEYS = [' ', 'Space', 'Enter', 'ArrowRight'] as const

/** Copies the join link; the icon flips to a check for a moment as feedback. */
function CopyLinkButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(false), 1800)
    return () => window.clearTimeout(id)
  }, [done])
  return (
    <button
      type="button"
      onClick={() => {
        void copyText(text).then((ok) => {
          setDone(ok)
          if (ok) toast.success(t('app.copied'))
          else toast.error(t('game.copyFailed'))
        })
      }}
      aria-label={t('game.copyLink')}
      title={t('game.copyLink')}
      data-testid="copy-join-url"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-elev-2 hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
    >
      {done ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </button>
  )
}

export default function HostGame() {
  const { t } = useTranslation()
  usePageTitle(t('titles.hostGame'))
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const snapshot = useGameStore((s) => s.snapshot)
  const role = useGameStore((s) => s.role)
  const joinAsHost = useGameStore((s) => s.joinAsHost)
  const hostNext = useGameStore((s) => s.hostNext)
  const hostStart = useGameStore((s) => s.hostStart)
  const hostCancel = useGameStore((s) => s.hostCancel)
  const leave = useGameStore((s) => s.leave)
  const [joinFailed, setJoinFailed] = useState(false)
  const hasSession = Boolean(sessionId) && readHostSession(sessionId) !== null
  const missing = !hasSession || joinFailed
  const fullscreen = useFullscreen()

  usePhaseAnnouncer(snapshot)
  useGameErrorToasts()

  useEffect(() => {
    if (!hasSession) return
    void joinAsHost(sessionId).then((ok) => {
      if (!ok) setJoinFailed(true)
    })
  }, [sessionId, hasSession, joinAsHost])

  const status = snapshot?.status
  const canNext =
    status === 'get_ready' ||
    status === 'question' ||
    status === 'reveal' ||
    status === 'leaderboard' ||
    status === 'podium'
  const next = useCallback(() => {
    if (canNext) void hostNext()
  }, [canNext, hostNext])
  useHotkey(NEXT_KEYS, next, canNext)

  const closeRoom = async () => {
    if (!window.confirm(t('game.closeRoomConfirm'))) return
    if (await hostCancel()) {
      toast.success(t('game.roomClosed'))
      leave()
      void navigate('/host', { replace: true })
    }
  }

  if (missing) {
    return (
      <div className="flex min-h-dvh flex-col">
        <ErrorScreen
          title={t('game.sessionNotFoundTitle')}
          text={t('game.sessionNotFoundText')}
          actionLabel={t('game.toDashboard')}
          actionTo="/host"
          testId="session-not-found"
        />
      </div>
    )
  }

  if (!snapshot || role !== 'host' || snapshot.sessionId !== sessionId) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t('app.connecting')} />
      </div>
    )
  }

  const hasNext = snapshot.questionIndex + 1 < snapshot.questionCount
  const nextLabel =
    status === 'question'
      ? t('game.skip')
      : status === 'reveal'
        ? t('game.showLeaderboard')
        : status === 'leaderboard'
          ? hasNext
            ? t('game.nextQuestion')
            : t('game.showPodium')
          : status === 'podium'
            ? t('game.finish')
            : t('game.next')

  return (
    <div
      className="flex min-h-dvh flex-col overflow-x-hidden"
      data-status={snapshot.status}
      data-question-type={snapshot.question?.type ?? undefined}
      data-testid="host-screen"
    >
      <ConnectionBanner />
      <header className="flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6">
        <Wordmark size="sm" />
        <span className="hidden truncate text-fg-muted sm:inline">{snapshot.quizTitle}</span>
        <div className="ml-auto flex items-center gap-2">
          {/* Phones have no room for the language switch next to the room controls;
              the choice is remembered from the dashboard anyway. */}
          <span className="hidden sm:contents">
            <LanguageSwitch />
          </span>
          <SoundToggle />
          {fullscreen.supported && (
            <button
              type="button"
              onClick={() => void fullscreen.toggle()}
              aria-label={fullscreen.active ? t('app.exitFullscreen') : t('app.fullscreen')}
              title={fullscreen.active ? t('app.exitFullscreen') : t('app.fullscreen')}
              data-testid="fullscreen-toggle"
              className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg-elev hover:bg-bg-elev-2 focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
            >
              {fullscreen.active ? (
                <Minimize2 className="size-5" aria-hidden="true" />
              ) : (
                <Maximize2 className="size-5" aria-hidden="true" />
              )}
            </button>
          )}
          {snapshot.status !== 'ended' && (
            <button
              type="button"
              onClick={() => void closeRoom()}
              aria-label={t('game.closeRoom')}
              title={t('game.closeRoom')}
              data-testid="close-room"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-bg-elev px-3 text-sm font-semibold text-fg-muted hover:border-error/60 hover:text-error focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none sm:px-4"
            >
              <DoorOpen className="size-5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('game.closeRoom')}</span>
            </button>
          )}
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-28 sm:px-8 sm:pb-24">
        {snapshot.status === 'lobby' && (
          <HostLobby snapshot={snapshot} sessionId={sessionId} onStart={() => void hostStart()} />
        )}
        {snapshot.status === 'get_ready' && (
          <Countdown
            size="host"
            endsAt={snapshot.deadline}
            label={`${t('game.getReady')} · ${t('game.questionOf', { index: snapshot.questionIndex + 1, total: snapshot.questionCount })}`}
          />
        )}
        {snapshot.status === 'question' && snapshot.question && (
          <HostQuestion snapshot={snapshot} question={snapshot.question} />
        )}
        {snapshot.status === 'reveal' && snapshot.question && snapshot.reveal && (
          <HostReveal snapshot={snapshot} question={snapshot.question} />
        )}
        {snapshot.status === 'leaderboard' && <HostLeaderboard snapshot={snapshot} />}
        {snapshot.status === 'podium' && <HostPodium snapshot={snapshot} />}
        {snapshot.status === 'ended' && (
          <HostEnded
            snapshot={snapshot}
            sessionId={sessionId}
            onNewGame={() => {
              leave()
              navigate('/host')
            }}
          />
        )}
      </main>

      {canNext && (
        <>
          {/* Phones: a full-width pinned action with a scrim, matching the lobby's start button.
              The keyboard hint only makes sense where there is a keyboard. */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-bg via-bg/90 to-transparent sm:hidden"
          />
          <div className="fixed inset-x-4 bottom-4 z-30 flex flex-col items-stretch gap-1 sm:inset-x-auto sm:right-8 sm:bottom-8 sm:items-end">
            <Button size="xl" onClick={next} data-testid="host-next" className="shadow-card">
              {nextLabel}
              <ChevronRight className="size-6" aria-hidden="true" />
            </Button>
            <span className="hidden text-xs text-fg-muted sm:inline">
              {t('game.hostShortcuts')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function HostLobby({
  snapshot,
  sessionId,
  onStart,
}: {
  snapshot: GameSnapshot
  sessionId: string
  onStart: () => void
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const hostKick = useGameStore((s) => s.hostKick)
  const joinUrl =
    readHostSession(sessionId)?.joinUrl ?? `${window.location.origin}/join?pin=${snapshot.pin}`
  const joinHost = joinUrl.replace(/^https?:\/\//, '').replace(/\/join.*$/, '')
  const prevCount = useRef(snapshot.players.length)
  const isTeam = snapshot.settings.mode === 'team'

  useEffect(() => {
    if (snapshot.players.length > prevCount.current) playSound('join')
    prevCount.current = snapshot.players.length
  }, [snapshot.players.length])

  const kick = (id: string, name: string) => {
    if (window.confirm(t('game.kickConfirm', { name }))) void hostKick(id)
  }

  return (
    <div
      className="grid flex-1 gap-6 py-4 lg:grid-cols-[1fr_minmax(16rem,22rem)]"
      data-testid="host-lobby"
    >
      <section className="flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-base text-balance text-fg-muted sm:text-xl md:text-2xl">
          {t('game.joinAt')} <span className="font-heading font-bold text-fg">{joinHost}</span> ·{' '}
          {t('game.pin')}
        </p>
        <p
          className="pin-display text-amber"
          data-testid="pin-display"
          data-pin={snapshot.pin}
          aria-label={`${t('game.pin')} ${snapshot.pin.split('').join(' ')}`}
        >
          {formatPin(snapshot.pin)}
        </p>
        <div className="flex flex-col items-center gap-2">
          <div
            className="rounded-2xl bg-fg p-3 sm:p-4"
            role="img"
            aria-label={t('a11y.qr')}
            data-testid="qr-code"
          >
            {/* The SVG is vector, so CSS sizing keeps it crisp: phone-sized on a phone,
                large enough to scan across a room from the projector. */}
            <QRCodeSVG
              value={joinUrl}
              size={288}
              bgColor="#F4F6FF"
              fgColor="#141B33"
              level="M"
              className="size-44 sm:size-56 lg:size-72"
            />
          </div>
          <p className="text-sm text-fg-muted">{t('game.scanQr')}</p>
          <div className="flex w-full max-w-sm items-center gap-1 rounded-xl bg-bg-elev py-1 pr-1 pl-3 sm:w-auto">
            <code
              className="min-w-0 flex-1 truncate text-left text-xs text-fg-muted sm:text-sm"
              data-testid="join-url"
            >
              {joinUrl}
            </code>
            <CopyLinkButton text={joinUrl} />
          </div>
        </div>
        <ul
          className="flex flex-wrap justify-center gap-2 text-sm text-fg-muted"
          aria-label={t('game.settings')}
        >
          <li className="rounded-full border border-line px-3 py-1">
            {isTeam ? t('game.mode.team') : t('game.mode.live')}
          </li>
          {isTeam && (
            <li className="rounded-full border border-line px-3 py-1">
              {t('game.teamSize', { count: snapshot.settings.teamSize })}
            </li>
          )}
          {snapshot.settings.shuffleQuestions && (
            <li className="rounded-full border border-line px-3 py-1">
              {t('game.shuffleQuestions')}
            </li>
          )}
          {snapshot.settings.shuffleOptions && (
            <li className="rounded-full border border-line px-3 py-1">
              {t('game.shuffleOptions')}
            </li>
          )}
          {snapshot.settings.showQuestionOnPlayer && (
            <li className="rounded-full border border-line px-3 py-1">{t('game.showQuestion')}</li>
          )}
          <li className="rounded-full border border-line px-3 py-1">
            {t('count.questions', { count: snapshot.questionCount })}
          </li>
        </ul>
      </section>

      <aside className="card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users className="size-5 text-teal" aria-hidden="true" />
            {t('game.players')}
          </h2>
          <span className="font-heading text-2xl font-extrabold tabular" data-testid="player-count">
            {snapshot.players.length}
          </span>
        </div>
        {/* The count is already the big number above; the sentence only earns its space on desktop. */}
        <p className="hidden text-sm text-fg-muted lg:block">
          {t('count.players', { count: snapshot.players.length })}
        </p>
        <div className="min-h-0 flex-1 lg:min-h-32">
          {snapshot.players.length === 0 ? (
            <p className="animate-pulse text-fg-muted">{t('game.noPlayersYet')}</p>
          ) : isTeam ? (
            <ul className="flex flex-col gap-3" data-testid="team-list">
              {snapshot.teams.map((team) => (
                <li key={team.id} className="rounded-2xl border border-line p-3">
                  <p className="mb-2 font-semibold">{team.name}</p>
                  <PlayerChips
                    players={snapshot.players.filter((p) => p.teamId === team.id)}
                    onKick={kick}
                    reduced={reduced}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <PlayerChips players={snapshot.players} onKick={kick} reduced={reduced} />
          )}
        </div>
        {snapshot.players.length === 0 && (
          <p className="text-center text-sm text-fg-muted">{t('game.startHint')}</p>
        )}
        {/* On phones the lobby is taller than the screen, so the primary action
            follows the host down the page instead of hiding under the player list.
            The scrim keeps content that scrolls beneath it legible. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-bg via-bg/90 to-transparent lg:hidden"
        />
        <Button
          size="xl"
          disabled={snapshot.players.length === 0}
          onClick={onStart}
          data-testid="host-start"
          className="fixed inset-x-4 bottom-4 z-30 shadow-card lg:static lg:inset-auto lg:w-full lg:shadow-none"
        >
          {t('game.start')}
        </Button>
      </aside>
    </div>
  )
}

function PlayerChips({
  players,
  onKick,
  reduced,
}: {
  players: GameSnapshot['players']
  onKick: (id: string, name: string) => void
  reduced: boolean
}) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-wrap gap-2" data-testid="player-chips">
      <AnimatePresence initial={false}>
        {players.map((p) => (
          <motion.li
            key={p.id}
            layout={!reduced}
            initial={reduced ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          >
            <button
              type="button"
              onClick={() => onKick(p.id, p.nickname)}
              aria-label={t('game.kick', { name: p.nickname })}
              title={t('game.kick', { name: p.nickname })}
              data-testid={`player-chip-${p.nickname}`}
              className={cn(
                'group inline-flex h-10 items-center gap-2 rounded-full border border-line bg-bg-elev-2 pr-2 pl-1 text-base font-semibold',
                'hover:border-error focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none',
                !p.connected && 'opacity-50',
              )}
            >
              <AnimalAvatar avatar={p.avatar} size="sm" />
              {p.nickname}
              <X className="size-4 text-fg-muted group-hover:text-error" aria-hidden="true" />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

// ---------------------------------------------------------------------------

function QuestionHeader({
  snapshot,
  question,
}: {
  snapshot: GameSnapshot
  question: PublicQuestion
}) {
  const { t } = useTranslation()
  const liveCount = useGameStore((s) => s.liveCount)
  const isQuestion = snapshot.status === 'question'
  // During the question the throttled live counter is freshest; after it, the reveal data is authoritative.
  const answered = isQuestion
    ? (liveCount?.answeredCount ?? snapshot.answeredCount)
    : (snapshot.reveal?.answeredCount ?? snapshot.answeredCount)
  const total = isQuestion
    ? (liveCount?.totalPlayers ?? snapshot.players.length)
    : (snapshot.reveal?.totalPlayers ?? snapshot.players.length)
  const progress = t('game.questionOf', { index: question.index + 1, total: question.total })
  const answeredLong = t('game.answered', { count: answered, total })
  return (
    // Phones get one compact row: "2/5 · 👥 3 з 4 · (timer)". Labels are spelled out from `sm`.
    <div className="flex items-center gap-2 py-2 sm:gap-4 sm:py-3">
      <span
        className="rounded-full bg-bg-elev px-3 py-1 text-sm font-semibold whitespace-nowrap text-fg-muted tabular sm:px-4 sm:py-1.5 sm:text-lg"
        data-testid="host-question-progress"
      >
        <span aria-hidden="true" className="sm:hidden">
          {question.index + 1}/{question.total}
        </span>
        <span className="sr-only sm:not-sr-only">{progress}</span>
      </span>
      <span className="hidden rounded-full bg-bg-elev px-4 py-1.5 text-base whitespace-nowrap text-fg-muted sm:inline">
        {t(`game.questionTypes.${question.type}`)}
      </span>
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        {question.type !== 'info' && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-bg-elev px-3 py-1 font-heading text-base whitespace-nowrap tabular sm:px-4 sm:py-1.5 sm:text-2xl"
            data-testid="answered-counter"
            aria-live="polite"
          >
            <Users className="size-4 text-teal sm:hidden" aria-hidden="true" />
            <span aria-hidden="true" className="sm:hidden">
              {t('game.answeredShort', { count: answered, total })}
            </span>
            <span className="sr-only sm:not-sr-only">{answeredLong}</span>
          </span>
        )}
        {isQuestion && snapshot.deadline != null && (
          <TimerRing
            deadline={snapshot.deadline}
            startedAt={snapshot.discussionUntil ?? snapshot.questionStartedAt}
            size={112}
            fluid
            className="size-16 sm:size-24 md:size-28"
            ticks
          />
        )}
      </div>
    </div>
  )
}

function HostQuestion({
  snapshot,
  question,
}: {
  snapshot: GameSnapshot
  question: PublicQuestion
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const optionLabel = useOptionLabel()
  const hasMedia = Boolean(question.mediaUrl)
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="host-question">
      <QuestionHeader snapshot={snapshot} question={question} />
      {/* On a projector the question floats in the free space; on a phone it stays at the top
          so the options are reachable without scrolling. */}
      <div className={cn('grid gap-4 sm:flex-1 sm:gap-6', hasMedia && 'lg:grid-cols-[3fr_2fr]')}>
        <div className="flex flex-col justify-center gap-4">
          <h1
            className="font-heading text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere] sm:text-[clamp(1.75rem,4vw,3.5rem)]"
            data-testid="host-question-text"
          >
            {question.text}
          </h1>
          {snapshot.settings.mode === 'team' && snapshot.discussionUntil != null && (
            <DiscussionBadge until={snapshot.discussionUntil} />
          )}
        </div>
        {hasMedia && (
          <div className="flex items-center justify-center">
            <Media url={question.mediaUrl} autoplay className="max-h-[30vh] sm:max-h-[45vh]" />
          </div>
        )}
      </div>
      {question.type === 'text' ? (
        <p className="rounded-2xl border border-line bg-bg-elev px-6 py-5 text-center text-xl text-fg-muted">
          {t('game.questionTypes.text')}
        </p>
      ) : question.type === 'info' ? (
        <p className="text-center text-lg text-fg-muted">{t('game.infoSlide')}</p>
      ) : (
        <div
          // A list on phones, like the player screen: two host-sized tiles side by side clip their text.
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
          data-testid="host-options"
        >
          {question.options.map((o, i) => (
            <motion.div
              key={o.id}
              initial={reduced ? false : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: reduced ? 0 : 0.1 + i * 0.08,
                type: 'spring',
                stiffness: 300,
                damping: 24,
              }}
            >
              <OptionButton
                index={o.index}
                text={optionLabel(question.type, o.text)}
                size="host"
                disabled
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiscussionBadge({ until }: { until: number }) {
  const { t } = useTranslation()
  const { seconds, done } = useCountdown(until)
  if (done) return null
  return (
    <p className="inline-flex w-fit items-center gap-2 rounded-full bg-violet/25 px-4 py-2 text-lg font-semibold text-fg">
      {t('play.discussion')} {seconds}
    </p>
  )
}

// ---------------------------------------------------------------------------

function HostReveal({ snapshot, question }: { snapshot: GameSnapshot; question: PublicQuestion }) {
  const { t } = useTranslation()
  const optionLabel = useOptionLabel()
  const reveal = snapshot.reveal
  if (!reveal) return null
  const correct = new Set(reveal.correctOptionIds)
  const counts = new Map(reveal.distribution.map((d) => [d.optionId, d.count]))
  const percent =
    reveal.totalPlayers > 0 ? Math.round((reveal.correctCount / reveal.totalPlayers) * 100) : 0
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="host-reveal">
      <QuestionHeader snapshot={snapshot} question={question} />
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-heading min-w-0 flex-1 text-[clamp(1.25rem,2.6vw,2.25rem)] leading-tight font-bold break-words [overflow-wrap:anywhere]">
          {question.text}
        </h1>
        <span
          className="rounded-full bg-success/20 px-3 py-1.5 font-heading text-lg font-bold whitespace-nowrap text-success tabular sm:px-4 sm:py-2 sm:text-xl"
          data-testid="correct-percent"
        >
          {/* Phones show just "n%"; the word "правильно" returns from `sm`, and screen readers always hear it. */}
          <span aria-hidden="true" className="sm:hidden">
            {percent}%
          </span>
          <span className="sr-only sm:not-sr-only">{t('game.correctPercent', { percent })}</span>
        </span>
      </div>
      {question.type === 'text' ? (
        <div className="grid flex-1 gap-6 lg:grid-cols-2">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold text-fg-muted">{t('game.topAnswers')}</h2>
            <RevealChart question={question} reveal={reveal} size="host" />
          </section>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-lg font-bold text-fg-muted">{t('game.acceptedAnswers')}</h2>
            <ul className="flex flex-wrap gap-2">
              {reveal.acceptedAnswers.map((a) => (
                <li
                  key={a}
                  className="rounded-full bg-success/20 px-4 py-2 text-xl font-semibold text-success"
                >
                  {a}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <RevealChart question={question} reveal={reveal} size="host" className="self-end" />
          <div
            className={cn(
              'grid gap-3',
              question.options.length <= 2 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2',
            )}
          >
            {question.options.map((o) => (
              <OptionButton
                key={o.id}
                index={o.index}
                text={optionLabel(question.type, o.text)}
                size="host"
                disabled
                count={counts.get(o.id) ?? 0}
                outcome={correct.has(o.id) ? 'correct' : 'incorrect'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function HostLeaderboard({ snapshot }: { snapshot: GameSnapshot }) {
  const { t } = useTranslation()
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 py-4"
      data-testid="host-leaderboard"
    >
      <h1 className="text-center font-heading text-[clamp(2rem,4vw,3.5rem)] font-bold">
        {t('game.leaderboard')}
      </h1>
      <Leaderboard entries={snapshot.leaderboard} limit={5} size="host" />
    </div>
  )
}

function HostPodium({ snapshot }: { snapshot: GameSnapshot }) {
  const { t } = useTranslation()
  const entries = snapshot.finalRanking ?? snapshot.leaderboard
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-end gap-8 py-4"
      data-testid="host-podium"
    >
      <h1 className="text-center font-heading text-[clamp(2rem,4vw,3.5rem)] font-bold">
        {t('game.podium')}
      </h1>
      <Podium entries={entries} size="host" celebrate />
    </div>
  )
}

function HostEnded({
  snapshot,
  sessionId,
  onNewGame,
}: {
  snapshot: GameSnapshot
  sessionId: string
  onNewGame: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const hostToken =
    useGameStore((s) => s.hostToken) ?? readHostSession(sessionId)?.hostToken ?? undefined
  const [result, setResult] = useState<GameResult | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer = 0
    // The archive may lag the `ended` broadcast by a moment (GAME_NOT_ENDED) — retry briefly.
    const load = (attempt: number) => {
      api.games
        .result(sessionId, hostToken)
        .then((r) => {
          if (!cancelled) setResult(r.result)
        })
        .catch(() => {
          if (!cancelled && attempt < 5) timer = window.setTimeout(() => load(attempt + 1), 800)
        })
    }
    load(0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sessionId, hostToken])

  const rows = useMemo<ResultRow[]>(() => {
    if (result) {
      return result.players.map((p) => ({
        id: p.playerId,
        rank: p.rank,
        nickname: p.nickname,
        avatar: p.avatar ?? null,
        score: p.score,
        correct: p.correctCount,
      }))
    }
    return fromRanking(snapshot.finalRanking ?? snapshot.leaderboard)
  }, [result, snapshot])

  const download = async () => {
    setDownloading(true)
    try {
      const blob = await api.games.resultCsv(sessionId, hostToken)
      downloadBlob(blob, `kontext-quiz-${snapshot.pin}.csv`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const scoredTotal = result ? result.questions.filter((q) => q.type !== 'info').length : undefined

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 py-4"
      data-testid="host-ended"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[clamp(2rem,4vw,3rem)] font-bold">{t('game.ended')}</h1>
          <p className="text-fg-muted">
            {snapshot.quizTitle} · {t('count.players', { count: rows.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            loading={downloading}
            onClick={() => void download()}
            data-testid="download-csv"
          >
            <Download className="size-5" aria-hidden="true" />
            {t('game.downloadCsv')}
          </Button>
          <Button size="lg" onClick={onNewGame} data-testid="new-game">
            {t('game.newGame')}
          </Button>
        </div>
      </div>
      <h2 className="text-xl font-bold">{t('game.results')}</h2>
      <ResultsTable rows={rows} total={scoredTotal} />
      <Link to="/host/history" className="text-sm text-fg-muted hover:text-fg">
        {t('app.nav.history')}
      </Link>
    </div>
  )
}
