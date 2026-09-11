import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { playSound, unlockAudio } from '@/lib/sound'
import { cn } from '@/lib/cn'

export function SoundToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const enabled = useSettingsStore((s) => s.soundEnabled)
  const setEnabled = useSettingsStore((s) => s.setSoundEnabled)
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? t('app.soundOn') : t('app.soundOff')}
      title={enabled ? t('app.soundOn') : t('app.soundOff')}
      data-testid="sound-toggle"
      onClick={() => {
        unlockAudio()
        setEnabled(!enabled)
        if (!enabled) playSound('join')
      }}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg-elev text-fg transition-colors hover:bg-bg-elev-2',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber',
        !enabled && 'text-fg-muted',
        className,
      )}
    >
      {enabled ? (
        <Volume2 className="size-5" aria-hidden="true" />
      ) : (
        <VolumeX className="size-5" aria-hidden="true" />
      )}
    </button>
  )
}
