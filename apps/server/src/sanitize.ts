import type { Question, QuizInput } from '@kontext/shared'
import type { QuizWrite } from './store/types.js'

// Control chars, zero-width chars, bidi overrides, BOM (tabs/newlines handled separately).
const INVISIBLE = new RegExp(
  // eslint-disable-next-line no-control-regex
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\uFEFF]',
  'g',
)

/** Strip control characters, collapse tabs/newlines to a space, trim. */
export function sanitizeText(s: string): string {
  return s
    .replace(INVISIBLE, '')
    .replace(/[\t\n\r]+/g, ' ')
    .trim()
}

/**
 * Sanitize every free-text field of a validated quiz input (returns a copy).
 * The zod-inferred `QuizInput['questions']` widens `timeLimit` to `number`; the
 * runtime values were validated against TIME_LIMITS, so narrowing to `Question[]` is safe.
 */
export function sanitizeQuizInput(input: QuizInput): QuizWrite {
  return {
    ...input,
    title: sanitizeText(input.title),
    coverUrl: input.coverUrl ? sanitizeText(input.coverUrl) : input.coverUrl,
    questions: input.questions.map((q) => ({
      ...q,
      text: sanitizeText(q.text),
      mediaUrl: q.mediaUrl ? sanitizeText(q.mediaUrl) : q.mediaUrl,
      options: q.options.map((o) => ({ ...o, id: sanitizeText(o.id), text: sanitizeText(o.text) })),
    })) as Question[],
  }
}
