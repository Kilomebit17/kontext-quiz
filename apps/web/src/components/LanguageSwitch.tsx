import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/cn'

const LABELS: Record<Locale, string> = { uk: 'UA', en: 'EN' }

export function LanguageSwitch({ className }: { className?: string }) {
  const { t } = useTranslation()
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  return (
    <div
      role="group"
      aria-label={t('a11y.languageSwitcher')}
      className={cn('inline-flex rounded-full border border-line bg-bg-elev p-0.5', className)}
      data-testid="language-switch"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          data-testid={`lang-${l}`}
          className={cn(
            'h-8 min-w-11 rounded-full px-2.5 text-xs font-bold tracking-wide transition-colors',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber',
            locale === l ? 'bg-amber text-fg-on-accent' : 'text-fg-muted hover:text-fg',
          )}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  )
}
