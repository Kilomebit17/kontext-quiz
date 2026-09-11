import { containsProfanity } from './profanity'
import { MAX_NICKNAME } from './types'
import { nicknameSchema } from './validation'

export type NicknameError = 'NICKNAME_INVALID' | 'NICKNAME_PROFANE'

// Control chars, zero-width chars, bidi overrides, BOM.
/* eslint-disable no-control-regex */
const INVISIBLE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\uFEFF]',
  'g',
)
/* eslint-enable no-control-regex */

/** Strip control characters, collapse whitespace, trim, cap length. */
export function sanitizeNickname(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME)
}

export function validateNickname(
  raw: string,
): { ok: true; nickname: string } | { ok: false; error: NicknameError } {
  const nickname = sanitizeNickname(raw)
  const parsed = nicknameSchema.safeParse(nickname)
  if (!parsed.success) return { ok: false, error: 'NICKNAME_INVALID' }
  if (containsProfanity(nickname)) return { ok: false, error: 'NICKNAME_PROFANE' }
  return { ok: true, nickname: parsed.data }
}

/**
 * Ensure a nickname is unique among `taken` (case-insensitive) by appending
 * " 2", " 3", ... Keeps the result within MAX_NICKNAME.
 */
export function dedupeNickname(nickname: string, taken: Iterable<string>): string {
  const lower = new Set(Array.from(taken, (t) => t.toLowerCase()))
  if (!lower.has(nickname.toLowerCase())) return nickname
  for (let i = 2; i < 1000; i++) {
    const suffix = ` ${i}`
    const candidate = nickname.slice(0, MAX_NICKNAME - suffix.length).trimEnd() + suffix
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
  return `${nickname.slice(0, MAX_NICKNAME - 5)}-${Math.floor(Math.random() * 10000)}`
}
