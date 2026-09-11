import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/migrate': 'src/db/migrate.ts',
    'db/seed': 'src/db/seed.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // @kontext/shared ships TypeScript source, so it must be bundled.
  noExternal: ['@kontext/shared'],
})
