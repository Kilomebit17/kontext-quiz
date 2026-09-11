import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <span role="status" className={cn('inline-flex items-center gap-3 text-fg-muted', className)}>
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-[3px] border-fg-muted/40 border-t-amber"
      />
      <span className="sr-only">{label ?? t('a11y.loading')}</span>
    </span>
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner />
    </div>
  )
}
