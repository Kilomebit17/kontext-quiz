import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  text?: string
  action?: ReactNode
  className?: string
  testId?: string
}

export function EmptyState({ icon, title, text, action, className, testId }: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn('card flex flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      {icon && (
        <div className="text-amber" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-xl font-bold">{title}</h2>
      {text && <p className="max-w-md text-fg-muted">{text}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
