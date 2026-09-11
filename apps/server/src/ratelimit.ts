import type Redis from 'ioredis'

export interface RateLimiter {
  /** Returns true when the call is allowed. */
  hit(key: string, now?: number): Promise<boolean>
}

/** Sliding-window limiter backed by process memory. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async hit(key: string, now = Date.now()): Promise<boolean> {
    this.sweep(now)
    const since = now - this.windowMs
    let arr = this.hits.get(key)
    if (!arr) {
      arr = []
      this.hits.set(key, arr)
    }
    while (arr.length && (arr[0] as number) <= since) arr.shift()
    if (arr.length >= this.max) return false
    arr.push(now)
    return true
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    const since = now - this.windowMs
    for (const [key, arr] of this.hits) {
      if (!arr.length || (arr[arr.length - 1] as number) <= since) this.hits.delete(key)
    }
  }
}

/** Sliding-window limiter on a Redis sorted set (shared across instances). */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async hit(key: string, now = Date.now()): Promise<boolean> {
    const k = `${this.prefix}:${key}`
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`
    const res = await this.redis
      .multi()
      .zremrangebyscore(k, 0, now - this.windowMs)
      .zcard(k)
      .zadd(k, now, member)
      .pexpire(k, this.windowMs)
      .exec()
    const countBefore = Number(res?.[1]?.[1] ?? 0)
    if (countBefore >= this.max) {
      await this.redis.zrem(k, member)
      return false
    }
    return true
  }
}

export function createRateLimiter(
  opts: { max: number; windowMs: number; prefix: string },
  redis?: Redis | null,
): RateLimiter {
  return redis
    ? new RedisRateLimiter(redis, opts.prefix, opts.max, opts.windowMs)
    : new MemoryRateLimiter(opts.max, opts.windowMs)
}
