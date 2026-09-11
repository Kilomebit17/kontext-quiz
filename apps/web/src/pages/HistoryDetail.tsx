import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download } from 'lucide-react'
import type { GameResult } from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { Button } from '@/components/Button'
import { ResultsTable } from '@/components/ResultsTable'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/stores/toastStore'
import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/download'
import { formatDate } from '@/lib/format'

export default function HistoryDetail() {
  const { t } = useTranslation()
  usePageTitle(t('titles.historyDetail'))
  const { id = '' } = useParams()
  const errorMessage = useErrorMessage()
  const locale = useSettingsStore((s) => s.locale)
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    let cancelled = false
    api.history
      .get(id)
      .then((r) => {
        if (!cancelled) setResult(r.result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [user, id, errorMessage])

  const download = async () => {
    setDownloading(true)
    try {
      const blob = await api.history.csv(id)
      downloadBlob(blob, `kontext-quiz-${result?.pin ?? id}.csv`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          to="/host/history"
          className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none rounded"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('history.back')}
        </Link>
        {authStatus === 'loading' || authStatus === 'idle' ? (
          <PageSpinner />
        ) : !user ? (
          <EmptyState title={t('history.loginRequired')} />
        ) : error ? (
          <EmptyState title={t('app.error')} text={error} />
        ) : !result ? (
          <PageSpinner />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">{result.quizTitle}</h1>
                <p className="text-fg-muted">
                  {formatDate(result.endedAt, locale)} ·{' '}
                  {t('count.players', { count: result.playerCount })} ·{' '}
                  {t('game.correctPercent', { percent: Math.round(result.averageCorrectPercent) })}
                </p>
              </div>
              <Button
                variant="secondary"
                loading={downloading}
                onClick={() => void download()}
                data-testid="download-csv"
              >
                <Download className="size-4" aria-hidden="true" />
                {t('game.downloadCsv')}
              </Button>
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">{t('history.questionStats')}</h2>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left">
                  <thead className="text-sm text-fg-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        #
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        {t('history.question')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        {t('history.correctPercent')}
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        {t('history.avgTime')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.questions.map((q) => (
                      <tr key={q.questionIndex} className="border-t border-line">
                        <td className="px-4 py-3 tabular">{q.questionIndex + 1}</td>
                        <td className="px-4 py-3">
                          {q.text}
                          {result.hardestQuestionIndex === q.questionIndex && (
                            <span className="ml-2 rounded-full bg-coral/20 px-2 py-0.5 text-xs font-bold text-coral">
                              {t('history.hardest')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular">
                          {q.type === 'info' ? '–' : `${Math.round(q.correctPercent)}%`}
                        </td>
                        <td className="px-4 py-3 text-right tabular">
                          {q.type === 'info' ? '–' : `${(q.averageTimeMs / 1000).toFixed(1)} s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">{t('history.playerTable')}</h2>
              <ResultsTable
                rows={result.players.map((p) => ({
                  id: p.playerId,
                  rank: p.rank,
                  nickname: p.nickname,
                  avatar: p.avatar ?? null,
                  score: p.score,
                  correct: p.correctCount,
                }))}
                total={result.questions.filter((q) => q.type !== 'info').length}
              />
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
