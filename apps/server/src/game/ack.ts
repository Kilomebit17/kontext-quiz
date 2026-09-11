import type { Ack, ErrorCode, ErrorPayload } from '@kontext/shared'

export type ErrAck = { ok: false; error: ErrorPayload }

/**
 * `Ack`'s default type parameter is `Record<string, never>`, which makes the
 * literal `{ ok: true }` unconstructible in TypeScript (the `ok` property is not
 * `never`). Runtime shape is exactly `{ ok: true }`; we assert once here.
 */
export const OK = { ok: true } as Ack

export const fail = (code: ErrorCode, message?: string): ErrAck => ({
  ok: false,
  error: message ? { code, message } : { code },
})
