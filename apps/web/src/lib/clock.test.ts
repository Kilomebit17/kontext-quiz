import { describe, expect, it } from 'vitest'
import { computeOffset, median, sampleOffset, serverNow, setClockOffset } from './clock'

describe('clock sync', () => {
  it('computes a single sample offset using half the round trip', () => {
    // client sent at 1000, got reply at 1100 (rtt 100), server said 6050
    expect(sampleOffset({ t0: 1000, t1: 1100, serverTime: 6050 })).toBe(5000)
  })

  it('median handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(0)
  })

  it('keeps the median offset across 5 samples, ignoring an outlier', () => {
    const samples = [
      { t0: 0, t1: 40, serverTime: 5020 }, // 5000
      { t0: 100, t1: 140, serverTime: 5122 }, // 5002
      { t0: 200, t1: 1200, serverTime: 6200 }, // outlier: rtt 1000 → 5500
      { t0: 300, t1: 340, serverTime: 5319 }, // 4999
      { t0: 400, t1: 440, serverTime: 5421 }, // 5001
    ]
    expect(computeOffset(samples)).toBe(5001)
  })

  it('serverNow applies the stored offset', () => {
    setClockOffset(1234)
    const now = Date.now()
    expect(serverNow() - now).toBeGreaterThanOrEqual(1234)
    expect(serverNow() - now).toBeLessThan(1234 + 50)
    setClockOffset(0)
  })

  it('ignores non-finite offsets', () => {
    setClockOffset(Number.NaN)
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50)
  })
})
