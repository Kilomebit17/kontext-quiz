import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameSnapshot } from '@kontext/shared'
import { useGameStore } from '@/stores/gameStore'
import { announce } from '@/stores/announcerStore'
import { toast } from '@/stores/toastStore'
import { useErrorMessage } from './useErrorMessage'
import { playSound } from '@/lib/sound'

/** Announces phase changes to the aria-live region and plays phase sounds. */
export function usePhaseAnnouncer(snapshot: GameSnapshot | null): void {
  const { t } = useTranslation()
  const phaseKey = useGameStore((s) => s.phaseKey)
  const last = useRef<string>('')

  useEffect(() => {
    if (!snapshot || phaseKey === last.current) return
    last.current = phaseKey
    const index = snapshot.questionIndex + 1
    const total = snapshot.questionCount
    switch (snapshot.status) {
      case 'lobby':
        announce(t('a11y.phaseLobby'))
        break
      case 'get_ready':
        announce(t('a11y.phaseGetReady', { index, total }))
        break
      case 'question':
        announce(t('a11y.phaseQuestion', { index, total }))
        playSound('questionStart')
        break
      case 'reveal':
        announce(t('a11y.phaseReveal', { index }))
        break
      case 'leaderboard':
        announce(t('a11y.phaseLeaderboard'))
        break
      case 'podium':
        announce(t('a11y.phasePodium'))
        break
      case 'ended':
        announce(t('a11y.phaseEnded'))
        break
    }
  }, [phaseKey, snapshot, t])
}

/** Surfaces non-fatal socket errors as toasts. */
export function useGameErrorToasts(): void {
  const lastError = useGameStore((s) => s.lastError)
  const clearError = useGameStore((s) => s.clearError)
  const errorMessage = useErrorMessage()
  useEffect(() => {
    if (!lastError) return
    toast.error(errorMessage(lastError))
    clearError()
  }, [lastError, clearError, errorMessage])
}
