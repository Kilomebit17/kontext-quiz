import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api'
import { SocketError } from '@/lib/socket'

const KNOWN = new Set([
  'INVALID_PIN',
  'GAME_NOT_FOUND',
  'GAME_ALREADY_STARTED',
  'GAME_ENDED',
  'NICKNAME_INVALID',
  'NICKNAME_PROFANE',
  'KICKED',
  'RATE_LIMITED',
  'INVALID_TOKEN',
  'NOT_HOST',
  'NOT_IN_QUESTION',
  'ALREADY_ANSWERED',
  'TOO_LATE',
  'TOO_EARLY',
  'INVALID_ANSWER',
  'INVALID_TRANSITION',
  'WRONG_INSTANCE',
  'INTERNAL',
  'NETWORK',
  'TIMEOUT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'INVALID_CREDENTIALS',
  'PASSWORD_NOT_SET',
  'HANDLE_INVALID',
])

const ALIASES: Record<string, string> = {
  VALIDATION_ERROR: 'VALIDATION',
  GAME_NOT_ENDED: 'NOT_FOUND',
}

export function errorCodeOf(err: unknown): string {
  let code = 'UNKNOWN'
  if (err instanceof ApiError || err instanceof SocketError) code = err.code
  else if (
    typeof err === 'object' &&
    err &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    code = (err as { code: string }).code
  }
  return ALIASES[code] ?? code
}

/** Maps API / socket error codes to localized messages. */
export function useErrorMessage() {
  const { t } = useTranslation()
  return useCallback(
    (err: unknown): string => {
      const code = errorCodeOf(err)
      return t(`errors.${KNOWN.has(code) ? code : 'UNKNOWN'}`)
    },
    [t],
  )
}
