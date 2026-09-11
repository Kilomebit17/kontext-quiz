import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import uk from './uk.json'

export const SUPPORTED_LOCALES = ['uk', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_STORAGE_KEY = 'kq.locale'

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'uk' || value === 'en'
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return 'uk'
  const short = value.toLowerCase().split('-')[0]
  return isLocale(short) ? short : 'uk'
}

// The default locale ships in the main bundle (no extra round-trip before first paint);
// other locales are code-split so a player only downloads the language in use.
const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  uk: () => Promise.resolve({ default: uk }),
  en: () => import('./en.json'),
}

export async function loadLocale(locale: Locale): Promise<void> {
  if (i18n.hasResourceBundle(locale, 'translation')) return
  const mod = await loaders[locale]()
  i18n.addResourceBundle(locale, 'translation', mod.default, true, true)
}

/** Load the bundle first, then switch — so no raw keys ever flash. */
export async function setLanguage(locale: Locale): Promise<void> {
  await loadLocale(locale)
  await i18n.changeLanguage(locale)
}

function syncHtmlLang(lng: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalizeLocale(lng)
  }
}

export const i18nReady: Promise<void> = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {},
    partialBundledLanguages: true,
    fallbackLng: 'uk',
    supportedLngs: [...SUPPORTED_LOCALES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    returnNull: false,
    react: { useSuspense: false },
  })
  .then(async () => {
    const locale = normalizeLocale(i18n.language)
    await loadLocale(locale)
    if (i18n.language !== locale) await i18n.changeLanguage(locale)
    syncHtmlLang(locale)
  })

i18n.on('languageChanged', syncHtmlLang)

export default i18n
