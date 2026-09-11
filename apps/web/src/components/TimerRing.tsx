import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCountdown } from '@/hooks/useCountdown'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/cn'

interface TimerRingProps {
  deadline: number | null
  startedAt: number | null
  size?: number
  /** Play tick sounds in the last 5 s (only one component per screen should). */
  ticks?: boolean
  className?: string
  onDone?: () => void
}

/** Circular countdown; pulses + ticks in the last 5 seconds. */
export function TimerRing({
  deadline,
  startedAt,
  size = 96,
  ticks = true,
  className,
  onDone,
}: TimerRingProps) {
  const { t } = useTranslation()
  const { seconds, fraction, done } = useCountdown(deadline, startedAt)
  const lastTick = useRef<number>(-1)
  const doneRef = useRef(false)

  useEffect(() => {
    if (deadline == null) return
    if (ticks && seconds > 0 && seconds <= 5 && lastTick.current !== seconds) {
      lastTick.current = seconds
      playSound('tick')
    }
  }, [seconds, ticks, deadline])

  useEffect(() => {
    doneRef.current = false
    lastTick.current = -1
  }, [deadline])

  useEffect(() => {
    if (done && deadline != null && !doneRef.current) {
      doneRef.current = true
      onDone?.()
    }
  }, [done, deadline, onDone])

  const stroke = Math.max(6, size / 12)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const urgent = deadline != null && seconds <= 5 && seconds > 0
  const color = urgent ? 'var(--coral)' : fraction < 0.4 ? 'var(--amber)' : 'var(--teal)'

  return (
    <div
      role="timer"
      aria-label={t('game.timeLeft', { seconds })}
      data-testid="timer"
      data-seconds={seconds}
      className={cn(
        'relative inline-flex items-center justify-center',
        urgent && 'animate-pulse-ring',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(244 246 255 / 0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 120ms linear, stroke 300ms' }}
        />
      </svg>
      <span
        className="absolute font-heading font-extrabold tabular"
        style={{ fontSize: size * 0.34, color }}
        aria-hidden="true"
      >
        {seconds}
      </span>
    </div>
  )
}
