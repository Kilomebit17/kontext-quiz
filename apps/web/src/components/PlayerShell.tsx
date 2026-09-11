import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'
import { SoundToggle } from './SoundToggle'
import { LanguageSwitch } from './LanguageSwitch'
import { ConnectionBanner } from './ConnectionBanner'
import { cn } from '@/lib/cn'

interface PlayerShellProps {
  children: ReactNode
  /** Extra content in the tiny header (e.g. nickname / score). */
  status?: ReactNode
  className?: string
  showLanguage?: boolean
}

/** Minimal chrome for phones: tiny wordmark + sound toggle, content fills the rest. */
export function PlayerShell({
  children,
  status,
  className,
  showLanguage = false,
}: PlayerShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBanner />
      <header className="flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <Wordmark size="sm" />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {status && <div className="min-w-0 truncate text-sm text-fg-muted">{status}</div>}
          {showLanguage && <LanguageSwitch />}
          <SoundToggle className="size-9" />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={cn('flex flex-1 flex-col px-3 pb-3 safe-bottom', className)}
      >
        {children}
      </main>
    </div>
  )
}
