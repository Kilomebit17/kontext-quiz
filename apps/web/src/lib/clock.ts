/**
 * Server clock synchronisation. The socket layer feeds ping samples here;
 * everything that needs "server now" reads `serverNow()`.
 */

export interface ClockSample {
  /** Client Date.now() when the ping was sent. */
  t0: number
  /** Client Date.now() when the pong arrived. */
  t1: number
  /** Server wall-clock reported in the pong. */
  serverTime: number
}

export function sampleOffset(sample: ClockSample): number {
  const rtt = Math.max(0, sample.t1 - sample.t0)
  return sample.serverTime - (sample.t0 + rtt / 2)
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/** Median of per-sample offsets — robust against one slow round trip. */
export function computeOffset(samples: readonly ClockSample[]): number {
  return median(samples.map(sampleOffset))
}

let clockOffset = 0
const listeners = new Set<(offset: number) => void>()

export function getClockOffset(): number {
  return clockOffset
}

export function setClockOffset(offset: number): void {
  clockOffset = Number.isFinite(offset) ? offset : 0
  for (const l of listeners) l(clockOffset)
}

export function onClockOffset(listener: (offset: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Estimated server wall-clock now (ms). */
export function serverNow(): number {
  return Date.now() + clockOffset
}
