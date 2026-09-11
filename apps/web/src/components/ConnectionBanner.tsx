import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'

export function ConnectionBanner() {
  const { t } = useTranslation()
  const connection = useGameStore((s) => s.connection)
  if (connection !== 'reconnecting') return null
  return (
    <div
      role="status"
      data-testid="reconnecting-banner"
      className="flex items-center justify-center gap-2 bg-amber px-4 py-2 text-center text-sm font-semibold text-fg-on-accent"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      {t('app.reconnecting')}
    </div>
  )
}
