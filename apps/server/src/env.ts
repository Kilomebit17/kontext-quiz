import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'

/**
 * Load `.env` files: apps/server/.env first (wins), then the repo root `.env`.
 * dotenv never overrides variables that are already set, so real environment
 * variables always take precedence. Safe to call multiple times.
 */
export function loadEnvFiles(): void {
  if (process.env.NODE_ENV === 'test') return
  const here = path.dirname(fileURLToPath(import.meta.url))
  // Both src/ and dist/ (and dist/db/) resolve to apps/server via the search below.
  let dir = here
  for (let i = 0; i < 4; i++) {
    if (path.basename(dir) === 'server') break
    dir = path.dirname(dir)
  }
  const serverDir = dir
  const rootDir = path.resolve(serverDir, '../..')
  dotenvConfig({ path: path.join(serverDir, '.env'), quiet: true })
  dotenvConfig({ path: path.join(rootDir, '.env'), quiet: true })
}
