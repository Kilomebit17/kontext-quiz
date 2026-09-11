/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const API_TARGET = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000'

/** Public, indexable routes listed in sitemap.xml (game/host pages are per-session). */
const PUBLIC_ROUTES = ['/', '/library', '/login']

/**
 * Emits robots.txt and sitemap.xml at build time from VITE_SITE_URL, so the
 * domain lives in exactly one place (.env.production / build variable).
 */
function seoFiles(siteUrl: string): Plugin {
  const origin = siteUrl.replace(/\/+$/, '')
  const today = new Date().toISOString().slice(0, 10)
  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    PUBLIC_ROUTES.map(
      (p) => `  <url><loc>${origin}${p}</loc><lastmod>${today}</lastmod></url>`,
    ).join('\n') +
    '\n</urlset>\n'
  const files: Record<string, string> = { 'robots.txt': robots, 'sitemap.xml': sitemap }
  return {
    name: 'kontext-seo-files',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files))
        this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0]?.slice(1) ?? ''
        const body = files[name]
        if (body === undefined) return next()
        res.setHeader('content-type', name.endsWith('.xml') ? 'application/xml' : 'text/plain')
        res.end(body)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')
  const siteUrl = env.VITE_SITE_URL || 'http://localhost:3000'
  return {
    plugins: [
      react(),
      tailwindcss(),
      seoFiles(siteUrl),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg', 'fonts/*.woff2', 'og.png'],
        manifest: {
          name: 'Kontext Quiz',
          short_name: 'Kontext',
          description: 'Вікторина в реальному часі для класу, команди чи вечірки',
          lang: 'uk',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#141B33',
          background_color: '#141B33',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/, /^\/healthz/, /^\/metrics/],
          runtimeCaching: [
            { urlPattern: /\/api\//, handler: 'NetworkOnly' },
            { urlPattern: /\/socket\.io\//, handler: 'NetworkOnly' },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': { target: API_TARGET, changeOrigin: true },
        '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Merge tiny shared chunks: fewer round-trips on slow mobile networks.
          experimentalMinChunkSize: 8000,
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
              return 'react'
            if (id.includes('node_modules/react-router')) return 'router'
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion'))
              return 'motion'
            if (id.includes('node_modules/socket.io') || id.includes('node_modules/engine.io'))
              return 'socket'
            if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next'))
              return 'i18n'
            if (id.includes('node_modules/xlsx') || id.includes('node_modules/papaparse'))
              return 'import'
            if (id.includes('node_modules/qrcode.react')) return 'qrcode'
            if (id.includes('node_modules/canvas-confetti')) return 'confetti'
            if (id.includes('node_modules/@sentry')) return 'sentry'
            return undefined
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
