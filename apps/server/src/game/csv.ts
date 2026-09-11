import type { GameResult } from '@kontext/shared'

const BOM = '\uFEFF'

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Columns: rank,nickname,score,correct,total, q1..qN (points), q1_time_ms..qN_time_ms.
 * N = number of scored (non-info) questions, in quiz order.
 */
export function resultToCsv(result: GameResult): string {
  const n = result.questions.length
  const header = ['rank', 'nickname', 'score', 'correct', 'total']
  for (let i = 1; i <= n; i++) header.push(`q${i}`)
  for (let i = 1; i <= n; i++) header.push(`q${i}_time_ms`)

  const lines = [header.join(',')]
  const players = [...result.players].sort((a, b) => a.rank - b.rank)
  for (const p of players) {
    const byIndex = new Map(p.answers.map((a) => [a.questionIndex, a]))
    const row: (string | number | null)[] = [p.rank, p.nickname, p.score, p.correctCount, n]
    for (const q of result.questions) row.push(byIndex.get(q.questionIndex)?.points ?? 0)
    for (const q of result.questions) row.push(byIndex.get(q.questionIndex)?.answerTimeMs ?? null)
    lines.push(row.map(cell).join(','))
  }
  return BOM + lines.join('\r\n') + '\r\n'
}
