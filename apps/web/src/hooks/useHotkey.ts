import { useEffect } from 'react'

/** Global keydown handler that ignores typing inside inputs. */
export function useHotkey(keys: readonly string[], handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (keys.includes(e.key) || keys.includes(e.code)) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys, handler, enabled])
}
