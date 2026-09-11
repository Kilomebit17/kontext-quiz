import { useEffect } from 'react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import type { LeaderboardEntry } from '@kontext/shared'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { fireConfetti } from '@/lib/confetti'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { AnimalAvatar } from './AnimalAvatar'

interface PodiumProps {
  entries: LeaderboardEntry[]
  /** Fire confetti + fanfare on mount. */
  celebrate?: boolean
  size?: 'player' | 'host'
  className?: string
}

/** 3rd, 2nd, 1st rise in sequence. */
export function Podium({ entries, celebrate = true, size = 'host', className }: PodiumProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const top = [entries[1], entries[0], entries[2]] // visual order: 2nd, 1st, 3rd
  const order = { 2: 0, 1: 1, 3: 2 } as const // rise order: 3rd first, then 2nd, then 1st
  const host = size === 'host'

  useEffect(() => {
    if (!celebrate) return
    const t1 = window.setTimeout(
      () => {
        playSound('fanfare')
        if (!reduced) void fireConfetti('podium')
      },
      reduced ? 0 : 1600,
    )
    return () => window.clearTimeout(t1)
  }, [celebrate, reduced])

  const heights = host ? ['h-40 md:h-56', 'h-56 md:h-80', 'h-28 md:h-40'] : ['h-24', 'h-36', 'h-16']
  const places = [2, 1, 3] as const
  const colors = ['bg-fg/80', 'bg-amber', 'bg-coral']
  const labels = [t('game.place2'), t('game.place1'), t('game.place3')]

  return (
    <div
      className={cn('flex w-full items-end justify-center gap-3 md:gap-6', className)}
      data-testid="podium"
    >
      {top.map((entry, i) => {
        const place = places[i] as 1 | 2 | 3
        const delay = reduced ? 0 : 0.2 + (2 - order[place]) * 0.55
        return (
          <div
            key={place}
            className="flex w-1/3 max-w-64 flex-col items-center gap-2"
            data-testid={`podium-${place}`}
          >
            {entry ? (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: delay + 0.35, duration: 0.4 }}
                className="flex flex-col items-center text-center"
              >
                {entry.avatar && (
                  <AnimalAvatar avatar={entry.avatar} size={host ? 'xl' : 'lg'} className="mb-2" />
                )}
                <span
                  className={cn(
                    'font-heading max-w-full truncate font-bold',
                    host ? 'text-2xl md:text-4xl' : 'text-lg',
                  )}
                >
                  {entry.nickname}
                </span>
                <span
                  className={cn(
                    'font-heading tabular text-fg-muted',
                    host ? 'text-xl md:text-2xl' : 'text-sm',
                  )}
                >
                  {entry.score}
                </span>
              </motion.div>
            ) : (
              <span className="text-fg-muted">–</span>
            )}
            <motion.div
              initial={reduced ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay, duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: 'bottom' }}
              className={cn(
                'flex w-full items-start justify-center rounded-t-3xl pt-4 font-heading font-extrabold text-fg-on-accent',
                heights[i],
                colors[i],
                host ? 'text-5xl md:text-7xl' : 'text-3xl',
              )}
              aria-label={labels[i]}
            >
              {place}
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}
