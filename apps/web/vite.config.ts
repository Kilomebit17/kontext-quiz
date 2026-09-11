/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const API_TARGET = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:4000'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Kontext Quiz',
        short_name: 'Kontext',
        description: 'Real-time multiplayer quiz game',
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
})
