// Renders the Open Graph / social preview image (public/og.png, 1200×630)
// with the real brand fonts and marks, via headless Chromium.
// Run: pnpm --filter @kontext/web og
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { chromium } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const pub = path.resolve(here, '../public')
const fontUrl = (f) => pathToFileURL(path.join(pub, 'fonts', f)).href
// The leaf icon is inlined as a data URI: Chromium refuses file:// URLs in CSS masks.
const leafIcon =
  'data:image/svg+xml;base64,' +
  (await readFile(path.join(pub, 'icons', 'kontext-icon.svg'))).toString('base64')

const html = `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<style>
  @font-face { font-family: Unbounded; src: url('${fontUrl('unbounded-latin-wght-normal.woff2')}') format('woff2'); font-weight: 200 900; }
  @font-face { font-family: Unbounded; src: url('${fontUrl('unbounded-cyrillic-wght-normal.woff2')}') format('woff2'); font-weight: 200 900; unicode-range: U+0400-04FF; }
  @font-face { font-family: Inter; src: url('${fontUrl('inter-latin-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Inter; src: url('${fontUrl('inter-cyrillic-wght-normal.woff2')}') format('woff2'); font-weight: 100 900; unicode-range: U+0400-04FF; }
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; overflow: hidden; color: #F4F6FF;
    background: radial-gradient(900px 600px at 15% 10%, #1F2A5C 0%, #141B33 55%, #0F142A 100%);
    font-family: Inter, system-ui, sans-serif; position: relative;
  }
  .glow { position: absolute; border-radius: 999px; filter: blur(70px); opacity: .55; }
  .g1 { width: 420px; height: 420px; right: -90px; top: -140px; background: #7C6FF0; }
  .g2 { width: 360px; height: 360px; right: 180px; bottom: -220px; background: #2EC4B6; opacity: .35; }
  .wrap { position: absolute; inset: 0; padding: 72px 80px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
  .brand { display: flex; align-items: center; gap: 28px; }
  .tile { width: 96px; height: 96px; flex: none; }
  .word { font-family: Unbounded; font-weight: 800; font-size: 84px; letter-spacing: .04em; line-height: 1; display: flex; align-items: baseline; gap: .3em; text-transform: uppercase; }
  .word .quiz { font-weight: 300; letter-spacing: .12em; color: #FF6B6B; }
  .leaf { display: inline-block; width: .76em; height: 1.04em; transform: translateY(.14em); margin: 0 .06em; background: currentColor;
          -webkit-mask: url('${leafIcon}') center / contain no-repeat; mask: url('${leafIcon}') center / contain no-repeat; }
  .tag { font-size: 40px; line-height: 1.25; color: #C9D0F2; max-width: 700px; font-weight: 500; }
  .pills { display: flex; gap: 14px; margin-top: 8px; }
  .pill { font-size: 24px; font-weight: 600; padding: 12px 22px; border-radius: 999px; border: 2px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); }
  .shapes { position: absolute; right: 80px; bottom: 64px; display: grid; grid-template-columns: repeat(2, 120px); gap: 22px; }
  .shape { width: 120px; height: 120px; border-radius: 30px; display: grid; place-items: center; box-shadow: 0 18px 40px rgba(0,0,0,.35); }
</style></head>
<body>
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="wrap">
    <div class="brand">
      <svg class="tile" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1C2447"/><rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#2EC4B6" stroke-opacity=".35" stroke-width="2"/><path d="M9 21c3-4 6-4 9 0s6 4 9 0" fill="none" stroke="#FF6B6B" stroke-width="4" stroke-linecap="round"/><path d="M46 10l2.6 7.4L56 20l-7.4 2.6L46 30l-2.6-7.4L36 20l7.4-2.6z" fill="#2EC4B6"/><circle cx="18" cy="46" r="7.5" fill="none" stroke="#FFB627" stroke-width="4.5"/><path d="M46 36l9 10-9 10-9-10z" fill="#7C6FF0"/></svg>
      <div class="word"><span>K<span class="leaf"></span>NTEXT</span><span class="quiz">Quiz</span></div>
    </div>
    <div class="tag">Вікторина в реальному часі — для класу, команди чи вечірки</div>
    <div class="pills"><span class="pill">PIN або QR-код</span><span class="pill">Гравці з телефонів</span><span class="pill">Безкоштовно</span></div>
  </div>
  <div class="shapes">
    <div class="shape" style="background:#FF6B6B"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#141B33" stroke-width="3" stroke-linecap="round"><path d="M3 12c3-4 6-4 9 0s6 4 9 0"/></svg></div>
    <div class="shape" style="background:#2EC4B6"><svg width="56" height="56" viewBox="0 0 24 24" fill="#141B33"><path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/></svg></div>
    <div class="shape" style="background:#FFB627"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#141B33" stroke-width="4"><circle cx="12" cy="12" r="7"/></svg></div>
    <div class="shape" style="background:#7C6FF0"><svg width="56" height="56" viewBox="0 0 24 24" fill="#141B33"><path d="M12 2l9 10-9 10-9-10z"/></svg></div>
  </div>
</body></html>`

const tmp = path.join(pub, '.og-tmp.html')
await writeFile(tmp, html)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(tmp).href)
// Wait for the self-hosted fonts before taking the shot (runs inside the page).
await page.evaluate('document.fonts.ready')
await page.screenshot({ path: path.join(pub, 'og.png'), type: 'png' })
await browser.close()
await unlink(tmp)
const size = (await readFile(path.join(pub, 'og.png'))).length
console.log(`wrote public/og.png (${Math.round(size / 1024)} KB)`)
