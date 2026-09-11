import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

interface ErrorScreenProps {
  title: string
  text?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  icon?: ReactNode
  testId?: string
}

export function ErrorScreen({
  title,
  text,
  actionLabel,
  actionTo = '/',
  onAction,
  icon,
  testId,
}: ErrorScreenProps) {
  const { t } = useTranslation()
  const label = actionLabel ?? t('app.home')
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
      data-testid={testId}
    >
      {icon && (
        <div className="text-amber" aria-hidden="true">
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {text && <p className="max-w-md text-fg-muted">{text}</p>}
      {onAction ? (
        <Button size="lg" onClick={onAction}>
          {label}
        </Button>
      ) : (
        <Link
          to={actionTo}
          className="inline-flex h-14 items-center rounded-2xl bg-amber px-6 text-lg font-semibold text-fg-on-accent focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
        >
          {label}
        </Link>
      )}
    </div>
  )
}
