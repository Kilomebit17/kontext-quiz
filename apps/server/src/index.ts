import { loadEnvFiles } from './env.js'
loadEnvFiles()

import Redis from 'ioredis'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { MemoryStore } from './store/memory.js'
import { PgStore } from './store/pg.js'
import type { Store } from './store/types.js'

async function main(): Promise<void> {
  const config = loadConfig()

  if (config.SENTRY_DSN) {
    const Sentry = await import('@sentry/node')
    Sentry.init({ dsn: config.SENTRY_DSN, environment: config.NODE_ENV, tracesSampleRate: 0.05 })
  }

  const store: Store =
    config.storeKind === 'pg' ? new PgStore(config.DATABASE_URL as string) : new MemoryStore()

  let redis: Redis | null = null
  if (config.REDIS_URL) {
    redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false })
    redis.on('error', (e) => console.error('[redis]', e.message))
  }

  const server = await createApp({ config, store, redis })
  const url = await server.listen()
  server.app.log.info(
    {
      url,
      instanceId: server.instanceId,
      store: store.kind,
      redis: Boolean(redis),
      env: config.NODE_ENV,
    },
    'kontext-quiz server listening',
  )

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    server.app.log.info({ signal }, 'shutting down')
    const force = setTimeout(() => process.exit(1), 15_000)
    force.unref()
    try {
      await server.close()
      if (redis) await redis.quit().catch(() => undefined)
      await store.close()
      process.exit(0)
    } catch (e) {
      server.app.log.error({ err: e }, 'shutdown failed')
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
