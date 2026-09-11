import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuestionType } from '@kontext/shared'

/** True/false options are stored as "true"/"false" and displayed localized. */
export function useOptionLabel() {
  const { t } = useTranslation()
  return useCallback(
    (type: QuestionType, text: string): string => {
      if (type !== 'truefalse') return text
      const v = text.trim().toLowerCase()
      if (v === 'true') return t('editor.true')
      if (v === 'false') return t('editor.false')
      return text
    },
    [t],
  )
}
