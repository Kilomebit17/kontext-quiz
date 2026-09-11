/**
 * CSV / XLSX question import.
 *
 * Expected columns (header row optional):
 *   question; option1; option2; option3; option4; correct (1-4, "1,3"); time limit (s)
 * Delimiter is auto-detected (`;` or `,`).
 */
import { TIME_LIMITS, type Question, type QuizOption, type TimeLimit } from '@kontext/shared'
import { newId } from './ids'

export interface ImportWarning {
  row: number
  reason: 'empty' | 'no-question' | 'too-few-options' | 'no-correct' | 'bad-correct'
}

export interface ImportResult {
  questions: Question[]
  warnings: ImportWarning[]
}

export type Row = (string | number | boolean | null | undefined)[]

const HEADER_HINTS = [
  'question',
  'запитання',
  'питання',
  'text',
  'option',
  'варіант',
  'correct',
  'правил',
  'time',
  'час',
]

function cell(row: Row, i: number): string {
  const v = row[i]
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export function looksLikeHeader(row: Row): boolean {
  const first = cell(row, 0).toLowerCase()
  const correct = cell(row, 5).toLowerCase()
  if (HEADER_HINTS.some((h) => first.startsWith(h) || correct.startsWith(h))) return true
  // A data row must have a numeric "correct" column.
  return cell(row, 5) !== '' && !/^[\d\s,;]+$/.test(cell(row, 5))
}

export function detectDelimiter(text: string): ';' | ',' {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const semi = (firstLine.match(/;/g) ?? []).length
  const comma = (firstLine.match(/,/g) ?? []).length
  return semi >= comma ? ';' : ','
}

function nearestTimeLimit(raw: string): TimeLimit {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 20
  let best: TimeLimit = TIME_LIMITS[0]
  for (const t of TIME_LIMITS) {
    if (Math.abs(t - n) < Math.abs(best - n)) best = t
  }
  return best
}

export function parseCorrect(raw: string, optionCount: number): number[] | null {
  const parts = raw
    .split(/[,;/ ]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const out = new Set<number>()
  for (const p of parts) {
    let n = Number.parseInt(p, 10)
    if (!Number.isFinite(n)) {
      // allow A-D
      const letter = p.toUpperCase()
      if (/^[A-D]$/.test(letter)) n = letter.charCodeAt(0) - 64
      else return null
    }
    if (n < 1 || n > optionCount) return null
    out.add(n - 1)
  }
  return [...out].sort((a, b) => a - b)
}

/** Convert raw rows (strings/cells) into validated questions. */
export function rowsToQuestions(rows: Row[]): ImportResult {
  const questions: Question[] = []
  const warnings: ImportWarning[] = []
  let start = 0
  if (rows.length > 0 && rows[0] && looksLikeHeader(rows[0])) start = 1

  for (let r = start; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rowNumber = r + 1
    if (row.every((c) => cell([c], 0) === '')) {
      continue
    }
    const text = cell(row, 0).slice(0, 120)
    if (!text) {
      warnings.push({ row: rowNumber, reason: 'no-question' })
      continue
    }
    const optionTexts = [1, 2, 3, 4].map((i) => cell(row, i)).filter((t) => t.length > 0)
    if (optionTexts.length < 2) {
      warnings.push({ row: rowNumber, reason: 'too-few-options' })
      continue
    }
    const correctRaw = cell(row, 5)
    if (!correctRaw) {
      warnings.push({ row: rowNumber, reason: 'no-correct' })
      continue
    }
    const correctIdx = parseCorrect(correctRaw, optionTexts.length)
    if (!correctIdx || correctIdx.length === 0) {
      warnings.push({ row: rowNumber, reason: 'bad-correct' })
      continue
    }
    const options: QuizOption[] = optionTexts.map((t, i) => ({
      id: newId('o'),
      text: t.slice(0, 75),
      isCorrect: correctIdx.includes(i),
    }))
    const isTrueFalse =
      options.length === 2 &&
      options.every((o) => /^(true|false|так|ні|yes|no|правда|брехня)$/i.test(o.text))
    questions.push({
      id: newId('q'),
      type: correctIdx.length > 1 ? 'multiple' : isTrueFalse ? 'truefalse' : 'single',
      text,
      mediaUrl: null,
      options,
      timeLimit: nearestTimeLimit(cell(row, 6)),
      pointsMultiplier: 1,
    })
  }
  return { questions, warnings }
}

export async function parseCsv(text: string): Promise<ImportResult> {
  const Papa = (await import('papaparse')).default
  const clean = text.replace(/^\uFEFF/, '')
  const parsed = Papa.parse<string[]>(clean, {
    delimiter: detectDelimiter(clean),
    skipEmptyLines: 'greedy',
  })
  return rowsToQuestions(parsed.data)
}

export async function parseXlsx(data: ArrayBuffer): Promise<ImportResult> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array' })
  const first = wb.SheetNames[0]
  if (!first) return { questions: [], warnings: [] }
  const sheet = wb.Sheets[first]
  if (!sheet) return { questions: [], warnings: [] }
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, raw: false, defval: '' })
  return rowsToQuestions(rows)
}

export async function parseImportFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsx(await file.arrayBuffer())
  }
  return parseCsv(await file.text())
}
