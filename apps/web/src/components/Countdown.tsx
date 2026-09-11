import { useEffect, useMemo, useState } from 'react'
import { playSound } from '@/lib/sound'
import { serverNow } from '@/lib/clock'

interface CountdownProps {
  /** Server time at which the countdown ends (question start). */
  endsAt: number | null
  label?: string
  size?: 'player' | 'host'
}

/** Visual length of the 3-2-1 countdown when the server gave no end time. */
const FALLBACK_MS = 3000

const digitFor = (end: number) => Math.max(1, Math.min(3, Math.ceil((end - serverNow()) / 1000)))

/** 3-2-1 countdown; each digit scales/fades in via a CSS keyframe (respects reduced motion). */
export function Countdown({ endsAt, label, size = 'player' }: CountdownProps) {
  // The fallback end is anchored once per countdown; recomputing it every tick would freeze the digit at 3.
  const end = useMemo(() => endsAt ?? serverNow() + FALLBACK_MS, [endsAt])
  const [n, setN] = useState(() => digitFor(end))

  useEffect(() => {
    let last = -1
    const id = window.setInterval(() => {
      const next = digitFor(end)
      if (next !== last) {
        last = next
        setN(next)
        playSound('countdown')
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [end])

  const digit = size === 'host' ? 'text-[clamp(8rem,28vh,20rem)]' : 'text-[clamp(6rem,30vw,10rem)]'

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4"
      data-testid="countdown"
      data-count={n}
    >
      {label && <p className="text-xl font-semibold text-fg-muted sm:text-2xl">{label}</p>}
      <div
        className={`relative flex items-center justify-center font-heading font-extrabold leading-none tabular ${digit}`}
      >
        <span key={n} className="animate-count-in text-amber" aria-live="off">
          {n}
        </span>
      </div>
    </div>
  )
}
