import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { MIN_PASSWORD, handleSchema } from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { AnimalAvatar } from '@/components/AnimalAvatar'
import { Input } from '@/components/Field'
import { Button } from '@/components/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'

export default function Login() {
  const { t } = useTranslation()
  usePageTitle(t('titles.login'))
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const user = useAuthStore((s) => s.user)
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword)

  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [nickError, setNickError] = useState<string | null>(null)
  const [passError, setPassError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const urlError = params.get('error')

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = handleSchema.safeParse(nickname)
    let ok = true
    if (!parsed.success) {
      setNickError(t('errors.HANDLE_INVALID'))
      ok = false
    }
    if (password.length < MIN_PASSWORD) {
      setPassError(t('login.passwordPlaceholder'))
      ok = false
    }
    if (!ok || !parsed.success) return
    setBusy(true)
    setFormError(null)
    try {
      const r = await loginWithPassword(parsed.data, password)
      toast.success(
        t(r.created ? 'login.created' : 'login.welcomeBack', { nickname: r.user.nickname }),
      )
      void navigate('/host', { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const goHostClass =
    'inline-flex h-12 items-center justify-center rounded-xl bg-amber px-5 font-semibold text-fg-on-accent focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none'

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <h1 className="text-3xl font-bold">{t('login.heading')}</h1>
        {urlError && (
          <p
            role="alert"
            data-testid="login-url-error"
            className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-sm"
          >
            {t(
              urlError === 'invalid_link'
                ? 'login.errors.invalid_link'
                : urlError === 'oauth' || urlError === 'google'
                  ? 'login.errors.oauth'
                  : 'login.errors.generic',
            )}
          </p>
        )}

        {user ? (
          <div className="card flex flex-col gap-4 p-6" data-testid="login-already">
            <div className="flex items-center gap-3">
              <AnimalAvatar avatar={user.avatar} size="lg" label={user.nickname} />
              <p>{t('login.alreadyIn', { nickname: user.nickname })}</p>
            </div>
            <Link to="/host" className={goHostClass}>
              {t('login.goHost')}
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => void submitPassword(e)}
            noValidate
            className="card flex flex-col gap-5 p-6"
            data-testid="password-form"
          >
            <Input
              label={t('login.nicknameLabel')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('login.nicknamePlaceholder')}
              value={nickname}
              hint={t('login.nicknameHint')}
              error={nickError}
              onChange={(e) => {
                setNickname(e.target.value)
                setNickError(null)
                setFormError(null)
              }}
              data-testid="nickname-input"
              required
            />
            <Input
              label={t('login.passwordLabel')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              error={passError ?? formError}
              onChange={(e) => {
                setPassword(e.target.value)
                setPassError(null)
                setFormError(null)
              }}
              inset={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                  aria-pressed={showPassword}
                  data-testid="toggle-password"
                  className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              }
              data-testid="password-input"
              required
            />
            <Button type="submit" size="lg" block loading={busy} data-testid="password-submit">
              {busy ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        )}
      </div>
    </AppShell>
  )
}
