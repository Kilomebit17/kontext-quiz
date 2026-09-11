import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n, { normalizeLocale, setLanguage, type Locale } from '@/i18n'
import { setSoundEnabled } from '@/lib/sound'

interface SettingsState {
  soundEnabled: boolean
  locale: Locale
  setSoundEnabled: (value: boolean) => void
  toggleSound: () => void
  setLocale: (locale: Locale) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      soundEnabled: true,
      locale: normalizeLocale(i18n.language),
      setSoundEnabled: (value) => {
        setSoundEnabled(value)
        set({ soundEnabled: value })
      },
      toggleSound: () => get().setSoundEnabled(!get().soundEnabled),
      setLocale: (locale) => {
        set({ locale })
        void setLanguage(locale)
      },
    }),
    {
      name: 'kq.settings',
      partialize: (s) => ({ soundEnabled: s.soundEnabled }),
      onRehydrateStorage: () => (state) => {
        if (state) setSoundEnabled(state.soundEnabled)
      },
    },
  ),
)

// Keep the store in sync when the language changes elsewhere (detector, ?lng=).
i18n.on('languageChanged', (lng) => {
  const locale = normalizeLocale(lng)
  if (useSettingsStore.getState().locale !== locale) useSettingsStore.setState({ locale })
})
