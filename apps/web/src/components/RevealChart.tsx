import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import type { PublicQuestion, RevealData } from '@kontext/shared'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { shapeFor } from './shapes'
import { cn } from '@/lib/cn'

interface RevealChartProps {
  question: PublicQuestion
  reveal: RevealData
  size?: 'player' | 'host'
  className?: string
}

/** Bar chart per option (or top text answers) that grows from 0. */
export function RevealChart({ question, reveal, size = 'host', className }: RevealChartProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const host = size === 'host'
  const correct = new Set(reveal.correctOptionIds)

  if (question.type === 'text') {
    const rows = [...reveal.textDistribution]
      .sort((a, b) => b.count - a.count)
      .slice(0, host ? 6 : 4)
    const max = Math.max(1, ...rows.map((r) => r.count))
    return (
      <div className={cn('flex flex-col gap-3', className)} role="img" aria-label={t('a11y.chart')}>
        {rows.length === 0 && <p className="text-fg-muted">{t('game.noAnswers')}</p>}
        {rows.map((r, i) => (
          <div key={`${r.text}-${i}`} className="flex items-center gap-3">
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-full',
                host ? 'size-9' : 'size-7',
                r.correct ? 'bg-success text-fg-on-accent' : 'bg-error text-fg-on-accent',
              )}
            >
              {r.correct ? (
                <Check className="size-5" aria-hidden="true" />
              ) : (
                <X className="size-5" aria-hidden="true" />
              )}
              <span className="sr-only">
                {r.correct ? t('a11y.optionCorrect') : t('a11y.optionIncorrect')}
              </span>
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-semibold',
                host ? 'text-2xl' : 'text-base',
              )}
            >
              {r.text}
            </span>
            <div className="h-3 w-1/3 overflow-hidden rounded-full bg-bg-elev-2" aria-hidden="true">
              <motion.div
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${(r.count / max) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
                className={cn('h-full rounded-full', r.correct ? 'bg-success' : 'bg-fg-muted')}
              />
            </div>
            <span
              className={cn(
                'font-heading w-10 text-right font-bold tabular',
                host ? 'text-2xl' : 'text-base',
              )}
            >
              {r.count}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const counts = new Map(reveal.distribution.map((d) => [d.optionId, d.count]))
  const max = Math.max(1, ...question.options.map((o) => counts.get(o.id) ?? 0))
  return (
    <div
      className={cn(
        'flex items-end justify-center gap-3 md:gap-6',
        host ? 'h-48 md:h-72' : 'h-32',
        className,
      )}
      role="img"
      aria-label={t('a11y.chart')}
      data-testid="reveal-chart"
    >
      {question.options.map((o, i) => {
        const shape = shapeFor(o.index)
        const count = counts.get(o.id) ?? 0
        const isCorrect = correct.has(o.id)
        return (
          <div
            key={o.id}
            className="flex h-full w-1/4 max-w-40 flex-col items-center justify-end gap-2"
          >
            <span className={cn('font-heading font-bold tabular', host ? 'text-3xl' : 'text-lg')}>
              {count}
            </span>
            <motion.div
              initial={reduced ? false : { height: 0 }}
              animate={{ height: `${Math.max(4, (count / max) * 100)}%` }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'w-full rounded-t-2xl',
                shape.bg,
                !isCorrect && 'opacity-40',
                isCorrect && 'shadow-[0_0_0_4px_rgb(61_220_151/0.6)]',
              )}
            />
            <span
              className={cn(
                'flex items-center justify-center rounded-xl',
                shape.bg,
                shape.onBg,
                host ? 'size-12' : 'size-9',
              )}
            >
              <shape.Icon className={host ? 'size-8' : 'size-6'} />
              <span className="sr-only">{t(`shapes.${shape.name}`)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
