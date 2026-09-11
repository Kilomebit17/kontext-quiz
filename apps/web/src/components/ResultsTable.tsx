import { useTranslation } from 'react-i18next'
import type { ResultRow } from '@/lib/results'
import { AnimalAvatar } from './AnimalAvatar'

export function ResultsTable({
  rows,
  total,
  testId = 'results-table',
}: {
  rows: ResultRow[]
  total?: number
  testId?: string
}) {
  const { t } = useTranslation()
  const showCorrect = rows.some((r) => r.correct != null)
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left" data-testid={testId}>
        <thead className="text-sm text-fg-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('game.rank')}
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              {t('game.nickname')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {t('game.score')}
            </th>
            {showCorrect && (
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {t('game.correct')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line" data-testid="results-row">
              <td className="font-heading px-4 py-3 font-bold tabular">{r.rank}</td>
              <td className="px-4 py-3 font-semibold">
                <span className="inline-flex items-center gap-2">
                  {r.avatar && <AnimalAvatar avatar={r.avatar} size="sm" />}
                  {r.nickname}
                </span>
              </td>
              <td className="font-heading px-4 py-3 text-right tabular">{r.score}</td>
              {showCorrect && (
                <td className="px-4 py-3 text-right tabular">
                  {r.correct}
                  {total != null ? ` / ${total}` : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
