import { useEffect, useRef, useState } from 'react'
import { serverNow } from '@/lib/clock'

export interface Countdown {
  /** Milliseconds left, never negative. */
  remainingMs: number
  /** Whole seconds left (ceil). */
  seconds: number
  /** 1 → 0 progress of the window [startedAt, deadline]. */
  fraction: number
  done: boolean
}

/**
 * Remaining time until a server-time deadline. Ticks every animation frame
 * but only re-renders when the displayed value (100 ms resolution) changes.
 */
export function useCountdown(deadline: number | null, startedAt?: number | null): Countdown {
  const compute = (): Countdown => {
    if (deadline == null) return { remainingMs: 0, seconds: 0, fraction: 0, done: true }
    const now = serverNow()
    const remainingMs = Math.max(0, deadline - now)
    const total = startedAt != null ? Math.max(1, deadline - startedAt) : null
    const fraction = total ? Math.min(1, Math.max(0, remainingMs / total)) : remainingMs > 0 ? 1 : 0
    return { remainingMs, seconds: Math.ceil(remainingMs / 1000), fraction, done: remainingMs <= 0 }
  }

  const [state, setState] = useState<Countdown>(compute)
  const lastBucket = useRef(-1)

  useEffect(() => {
    if (deadline == null) return
    let raf = 0
    let done = false
    const update = () => {
      const next = compute()
      // Bucket -1 marks "done" so the final transition (e.g. 40 ms → 0 ms, same
      // 100 ms bucket) always re-renders and consumers see `done: true`.
      const bucket = next.done ? -1 : Math.floor(next.remainingMs / 100)
      if (bucket !== lastBucket.current) {
        lastBucket.current = bucket
        setState(next)
      }
      done = next.done
    }
    const frame = () => {
      update()
      if (!done) raf = requestAnimationFrame(frame)
    }
    lastBucket.current = -2 // force one render for the new deadline, even if already done
    frame()
    // Fallback for background / occluded tabs where rAF is paused or throttled
    // (document.hidden is not always true there). The bucket check keeps this
    // from causing extra renders while rAF is healthy.
    const interval = window.setInterval(() => {
      if (!done) update()
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, startedAt])

  return deadline == null ? ZERO : state
}

const ZERO: Countdown = { remainingMs: 0, seconds: 0, fraction: 0, done: true }
