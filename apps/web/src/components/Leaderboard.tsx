import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { LeaderboardEntry } from '@kontext/shared'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'
import { AnimalAvatar } from './AnimalAvatar'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  limit?: number
  highlightId?: string | null
  size?: 'player' | 'host'
  className?: string
}

const medal = ['text-amber', 'text-fg', 'text-coral']

/** Ranked rows that FLIP-reorder when the order changes (`layout`). */
export function Leaderboard({
  entries,
  limit = 5,
  highlightId,
  size = 'player',
  className,
}: LeaderboardProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const rows = entries.slice(0, limit)
  const host = size === 'host'
  return (
    <ol className={cn('flex flex-col gap-2', host && 'gap-3', className)} data-testid="leaderboard">
      <AnimatePresence initial={false}>
        {rows.map((e, i) => {
          const delta = e.previousRank == null ? null : e.previousRank - e.rank
          return (
            <motion.li
              key={e.playerId}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 32,
                delay: reduced ? 0 : i * 0.05,
              }}
              data-testid={`leaderboard-row-${e.rank}`}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-line bg-bg-elev px-4 py-3',
                host && 'px-6 py-4',
                highlightId === e.playerId && 'border-amber ring-2 ring-amber/40',
              )}
            >
              <span
                className={cn(
                  'font-heading w-8 shrink-0 text-center font-extrabold tabular',
                  host ? 'text-3xl' : 'text-xl',
                  medal[e.rank - 1] ?? 'text-fg-muted',
                )}
              >
                {e.rank}
              </span>
              {e.avatar && <AnimalAvatar avatar={e.avatar} size={host ? 'md' : 'sm'} />}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate font-semibold',
                  host ? 'text-2xl' : 'text-base',
                )}
              >
                {e.nickname}
              </span>
              {e.streak >= 3 && (
                <span
                  className="shrink-0 rounded-full bg-coral/20 px-2 py-0.5 text-xs font-bold text-coral"
                  title={t('game.streakBadge', { count: e.streak })}
                >
                  {t('game.streakBadge', { count: e.streak })}
                </span>
              )}
              {delta != null && (
                <span
                  className={cn(
                    'shrink-0 text-xs font-bold tabular',
                    delta > 0 ? 'text-success' : delta < 0 ? 'text-error' : 'text-fg-muted',
                  )}
                  aria-hidden="true"
                >
                  {delta > 0
                    ? t('game.up', { n: delta })
                    : delta < 0
                      ? t('game.down', { n: -delta })
                      : t('game.same')}
                </span>
              )}
              <span
                className={cn(
                  'font-heading shrink-0 font-bold tabular',
                  host ? 'text-2xl' : 'text-lg',
                )}
              >
                {e.score}
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ol>
  )
}
