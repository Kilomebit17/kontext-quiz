import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Sparkles } from 'lucide-react'
import { isValidPin } from '@kontext/shared'
import { Wordmark } from '@/components/Wordmark'
import { PinInput } from '@/components/PinInput'
import { Button } from '@/components/Button'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { SoundToggle } from '@/components/SoundToggle'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { api, ApiError } from '@/lib/api'

export default function Landing() {
  const { t } = useTranslation()
  usePageTitle(t('titles.landing'))
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const check = useCallback(
    async (value: string) => {
      if (!isValidPin(value)) {
        setError(t('landing.pinIncomplete'))
        return
      }
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setChecking(true)
      setError(null)
      try {
        const r = await api.games.lookupPin(value, controller.signal)
        if (!r.exists) setError(t('landing.pinNotFound'))
        else if (r.status === 'ended') setError(t('landing.pinFinished'))
        else if (r.status && r.status !== 'lobby') setError(t('landing.pinStarted'))
        else navigate(`/join?pin=${value}`)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof ApiError && err.status === 429) setError(t('landing.pinTooMany'))
        else if (err instanceof ApiError && err.status === 404) setError(t('landing.pinNotFound'))
        else setError(errorMessage(err))
      } finally {
        if (abort.current === controller) setChecking(false)
      }
    },
    [navigate, t, errorMessage],
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Wordmark size="sm" />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <SoundToggle />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-10 px-4 py-8 sm:py-12"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Wordmark size="lg" link={false} />
          <p className="max-w-md text-fg-muted">{t('app.tagline')}</p>
        </div>

        <form
          className="card flex w-full max-w-xl flex-col items-center gap-6 px-5 py-8 sm:px-10"
          onSubmit={(e) => {
            e.preventDefault()
            void check(pin)
          }}
          noValidate
        >
          <h1 className="text-2xl font-bold sm:text-3xl">{t('landing.heading')}</h1>
          <PinInput
            value={pin}
            onChange={(v) => {
              setPin(v)
              setError(null)
            }}
            onComplete={(v) => void check(v)}
            disabled={checking}
            invalid={!!error}
            autoFocus
            describedBy="pin-error"
          />
          <p
            id="pin-error"
            role="alert"
            data-testid="pin-error"
            className="min-h-6 text-center text-sm text-error"
          >
            {error}
          </p>
          <Button type="submit" size="xl" block loading={checking} data-testid="pin-submit">
            {checking ? t('landing.checking') : t('landing.join')}
            {!checking && <ArrowRight className="size-6" aria-hidden="true" />}
          </Button>
          <Link
            to="/host"
            data-testid="host-link"
            className="inline-flex h-12 items-center justify-center rounded-xl px-4 text-base font-semibold text-teal hover:underline focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
          >
            {t('landing.host')}
          </Link>
        </form>

        <section className="flex w-full max-w-xl items-center gap-4 rounded-3xl border border-line bg-bg-elev/60 p-5">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet/25 text-violet"
            aria-hidden="true"
          >
            <Sparkles className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{t('landing.createCardTitle')}</h2>
            <p className="text-sm text-fg-muted">{t('landing.createCardText')}</p>
          </div>
          <Link
            to="/host/quiz/new"
            className="inline-flex h-10 shrink-0 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-bg-elev-2 focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
          >
            {t('landing.createCardAction')}
          </Link>
        </section>

        <nav className="flex gap-6 text-sm text-fg-muted" aria-label={t('app.menu')}>
          <Link
            to="/library"
            className="hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none rounded"
          >
            {t('landing.libraryLink')}
          </Link>
          <Link
            to="/login"
            className="hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none rounded"
          >
            {t('landing.loginLink')}
          </Link>
        </nav>
      </main>
    </div>
  )
}
