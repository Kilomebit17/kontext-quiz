// Generates PWA PNG icons from public/icons/icon.svg using sharp.
// Run: pnpm --filter @kontext/web icons
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.resolve(here, '../public/icons')
const svg = await readFile(path.join(iconsDir, 'icon.svg'))

async function render(size, out, { padding = 0 } = {}) {
  const inner = Math.round(size * (1 - padding * 2))
  const icon = await sharp(svg).resize(inner, inner).png().toBuffer()
  await sharp({
    // Tile colour of the four-shapes mark (matches public/icons/icon.svg).
    create: { width: size, height: size, channels: 4, background: '#1C2447' },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(path.join(iconsDir, out))
  console.log(`wrote ${out}`)
}

await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
// Maskable icons need ~10% safe-zone padding on every side.
await render(512, 'maskable-512.png', { padding: 0.1 })
