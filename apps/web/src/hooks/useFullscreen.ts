import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
  const [active, setActive] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  )

  useEffect(() => {
    const handler = () => setActive(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // unsupported (iOS Safari) — ignore
    }
  }, [])

  const supported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
  return { active, toggle, supported }
}
