/** Deterministic clock + scheduler for GameRoom tests. */
export function makeClock(start = 1_700_000_000_000) {
  let t = start
  interface Entry {
    at: number
    fn: () => void
    cancelled: boolean
  }
  const timers: Entry[] = []
  return {
    now: () => t,
    schedule: (fn: () => void, ms: number) => {
      const e: Entry = { at: t + ms, fn, cancelled: false }
      timers.push(e)
      return () => {
        e.cancelled = true
      }
    },
    /** Advance time, firing due timers in order. */
    advance(ms: number) {
      const target = t + ms
      for (;;) {
        let next: Entry | null = null
        for (const e of timers) {
          if (e.cancelled || e.at > target) continue
          if (!next || e.at < next.at) next = e
        }
        if (!next) break
        timers.splice(timers.indexOf(next), 1)
        t = next.at
        next.fn()
      }
      t = target
    },
    /** Jump the clock without firing timers (simulates a late packet before the timer runs). */
    jump(to: number) {
      t = to
    },
    pending: () => timers.filter((e) => !e.cancelled).length,
  }
}
