import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Db = ReturnType<typeof createDb>['db']

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: false })
  const db = drizzle(sql, { schema })
  return { sql, db }
}
