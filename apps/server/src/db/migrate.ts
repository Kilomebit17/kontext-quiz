import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { loadEnvFiles } from '../env.js'
import { createDb } from './client.js'

loadEnvFiles()

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required to run migrations')
  process.exit(1)
}

// Works both from src (tsx) and dist (bundled): the migrations folder lives at apps/server/drizzle.
const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(here, '../../drizzle')

const { db, sql } = createDb(url, { max: 1 })
try {
  await migrate(db, { migrationsFolder })
  console.log('Migrations applied from', migrationsFolder)
} finally {
  await sql.end()
}
