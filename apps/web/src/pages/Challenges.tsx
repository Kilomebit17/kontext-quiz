import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink } from 'lucide-react'
import type { Challenge } from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { Button } from '@/components/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { api } from '@/lib/api'
import { challengeUrl, copyText, formatDate } from '@/lib/format'

type ChallengeRow = Challenge & { expired: boolean }

export default function Challenges() {
  const { t } = useTranslation()
  usePageTitle(t('titles.challenges'))
  const errorMessage = useErrorMessage()
  const locale = useSettingsStore((s) => s.locale)
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const [list, setList] = useState<ChallengeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.challenges
      .list()
      .then((r) => {
        const now = Date.now()
        if (!cancelled)
          setList(
            r.challenges.map((c) => ({ ...c, expired: new Date(c.deadline).getTime() < now })),
          )
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [user, errorMessage])

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">{t('challenges.heading')}</h1>
        {authStatus === 'loading' || authStatus === 'idle' ? (
          <PageSpinner />
        ) : !user ? (
          <EmptyState
            title={t('challenges.loginRequired')}
            action={
              <Link
                to="/login"
                className="inline-flex h-11 items-center rounded-xl bg-amber px-4 font-medium text-fg-on-accent"
              >
                {t('app.nav.login')}
              </Link>
            }
          />
        ) : error ? (
          <EmptyState title={t('app.error')} text={error} />
        ) : !list ? (
          <PageSpinner />
        ) : list.length === 0 ? (
          <EmptyState title={t('challenges.empty')} text={t('challenges.emptyHint')} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="challenge-list">
            {list.map((c) => {
              const expired = c.expired
              const url = challengeUrl(c.code)
              return (
                <li key={c.id} className="card flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold">{c.quizTitle}</h2>
                    <span
                      className={
                        expired
                          ? 'rounded-full bg-fg/10 px-2 py-0.5 text-xs font-bold text-fg-muted'
                          : 'rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success'
                      }
                    >
                      {expired ? t('challenges.expired') : t('challenges.active')}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-fg-muted">{t('challenges.deadline')}</dt>
                    <dd>{formatDate(c.deadline, locale)}</dd>
                    <dt className="text-fg-muted">{t('challenges.attempts')}</dt>
                    <dd>{t('count.attempts', { count: c.attemptCount })}</dd>
                  </dl>
                  <code className="truncate rounded-lg bg-bg px-3 py-2 text-xs text-fg-muted">
                    {url}
                  </code>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void copyText(url).then((ok) =>
                          toast[ok ? 'success' : 'error'](ok ? t('app.copied') : t('app.error')),
                        )
                      }
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      {t('app.copy')}
                    </Button>
                    <Link
                      to={`/challenge/${c.code}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-teal hover:underline focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      {t('challenges.leaderboard')}
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
