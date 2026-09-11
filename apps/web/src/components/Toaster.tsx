import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/cn'

const kinds = {
  info: 'border-line bg-bg-elev-2 text-fg',
  success: 'border-success/40 bg-bg-elev-2 text-fg',
  error: 'border-error/60 bg-bg-elev-2 text-fg',
}

export function Toaster() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[90] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="assertive"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.kind}`}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-card',
            kinds[toast.kind],
          )}
        >
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t('app.close')}
            className="rounded-full p-1 text-fg-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
