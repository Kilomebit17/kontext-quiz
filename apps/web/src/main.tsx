import './styles/theme.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { i18nReady } from './i18n'
import App from './App'
import { initSentry } from './lib/sentry'

initSentry()
registerSW({ immediate: true })

const root = document.getElementById('root')
if (root) {
  void i18nReady.then(() => {
    createRoot(root).render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    )
  })
}
