import { useEffect } from 'react'

/** Sets `document.title` to "Kontext Quiz — {title}". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    const base = 'Kontext Quiz'
    document.title = title ? `${base} — ${title}` : base
    return () => {
      document.title = base
    }
  }, [title])
}
