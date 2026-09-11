import type { Locale } from '@/i18n'

export function formatDate(iso: string, locale: Locale | string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'uk' ? 'uk-UA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function challengeUrl(code: string): string {
  return `${window.location.origin}/challenge/${code}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
