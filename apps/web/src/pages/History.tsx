import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { Button } from '@/components/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { api, type HistoryItem } from '@/lib/api'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatDate } from '@/lib/format'

export default function History() {
  const { t } = useTranslation()
  usePageTitle(t('titles.history'))
  const errorMessage = useErrorMessage()
  const locale = useSettingsStore((s) => s.locale)
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const [games, setGames] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.history
      .list()
      .then((r) => {
        if (!cancelled) setGames(r.games)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [user, errorMessage])

  const remove = async (id: string) => {
    if (!window.confirm(t('history.confirmDelete'))) return
    try {
      await api.history.remove(id)
      setGames((g) => g?.filter((x) => x.id !== id) ?? null)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">{t('history.heading')}</h1>
        {authStatus === 'loading' || authStatus === 'idle' ? (
          <PageSpinner />
        ) : !user ? (
          <EmptyState
            title={t('history.loginRequired')}
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
        ) : !games ? (
          <PageSpinner />
        ) : games.length === 0 ? (
          <EmptyState title={t('history.empty')} text={t('history.emptyHint')} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left" data-testid="history-table">
              <thead className="text-sm text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t('history.date')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t('history.quiz')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t('history.mode')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('history.players')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('history.avgCorrect')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {t('history.hardest')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">{t('a11y.moreActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.id} className="border-t border-line">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(g.endedAt, locale)}</td>
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        to={`/host/history/${g.id}`}
                        className="hover:underline focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none rounded"
                      >
                        {g.quizTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {g.mode === 'team' ? t('game.mode.team') : t('game.mode.live')}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{g.playerCount}</td>
                    <td className="px-4 py-3 text-right tabular">
                      {Math.round(g.averageCorrectPercent)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {g.hardestQuestionIndex == null ? '–' : `#${g.hardestQuestionIndex + 1}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('history.delete')}
                        title={t('history.delete')}
                        onClick={() => void remove(g.id)}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
