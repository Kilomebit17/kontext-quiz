import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  testId?: string
}

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

/** Native <dialog>-based modal with focus trapping and Escape handling. */
export function Modal({ open, onClose, title, children, footer, size = 'md', testId }: ModalProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-labelledby={`${testId ?? 'modal'}-title`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-bg-elev p-0 text-fg shadow-card backdrop:bg-bg/80 backdrop:backdrop-blur-sm',
        'open:animate-[modal-in_180ms_ease-out]',
        sizes[size],
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id={`${testId ?? 'modal'}-title`} className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('a11y.closeDialog')}
          className="rounded-full p-2 text-fg-muted hover:bg-fg/10 hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          {footer}
        </div>
      )}
      <style>{`@keyframes modal-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </dialog>
  )
}
