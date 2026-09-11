import { useAnnouncer } from '@/stores/announcerStore'

/** Single global polite live region announcing phase changes and results. */
export function LiveRegion() {
  const message = useAnnouncer((s) => s.message)
  const seq = useAnnouncer((s) => s.seq)
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-region">
      <span key={seq}>{message}</span>
    </div>
  )
}
