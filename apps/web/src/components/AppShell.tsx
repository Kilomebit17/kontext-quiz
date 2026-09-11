import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LogOut, Menu, X } from 'lucide-react'
import { AnimalAvatar } from './AnimalAvatar'
import { AvatarPicker } from './AvatarPicker'
import { Modal } from './Modal'
import { Wordmark } from './Wordmark'
import { LanguageSwitch } from './LanguageSwitch'
import { SoundToggle } from './SoundToggle'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { cn } from '@/lib/cn'

interface AppShellProps {
  children: ReactNode
  /** Full-bleed content (host game screen). */
  bare?: boolean
  className?: string
}

const navItems = [
  { to: '/host', key: 'app.nav.host' },
  { to: '/library', key: 'app.nav.library' },
  { to: '/host/history', key: 'app.nav.history' },
  { to: '/host/challenges', key: 'app.nav.challenges' },
] as const

const focusRing = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber'
const pillButton = cn(
  'inline-flex size-11 items-center justify-center rounded-full border border-line bg-bg-elev text-fg-muted hover:text-fg',
  focusRing,
)

/** Header + content wrapper for host-side pages. */
export function AppShell({ children, bare = false, className }: AppShellProps) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const loadMe = useAuthStore((s) => s.loadMe)
  const logout = useAuthStore((s) => s.logout)
  const updateAvatar = useAuthStore((s) => s.updateAvatar)
  const errorMessage = useErrorMessage()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const pickAvatar = async (avatar: string) => {
    if (savingAvatar || avatar === user?.avatar) return
    setSavingAvatar(true)
    try {
      await updateAvatar(avatar)
      toast.success(t('app.avatarSaved'))
      setAvatarOpen(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingAvatar(false)
    }
  }
  const { pathname } = useLocation()
  // The mobile menu is open only for the path it was opened on, so it closes
  // itself after navigating without an effect.
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const menuOpen = menuOpenFor === pathname
  const setMenuOpen = (open: boolean) => setMenuOpenFor(open ? pathname : null)

  useEffect(() => {
    if (status === 'idle') void loadMe()
  }, [status, loadMe])

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpenFor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <Wordmark size="sm" />

          {/* Desktop navigation */}
          <nav aria-label={t('app.menu')} className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/host'}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    focusRing,
                    isActive ? 'bg-bg-elev-2 text-fg' : 'text-fg-muted hover:text-fg',
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          {/* Desktop controls */}
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <LanguageSwitch />
            <SoundToggle />
            {user ? (
              <div className="flex items-center gap-1" data-testid="user-menu">
                <button
                  type="button"
                  onClick={() => setAvatarOpen(true)}
                  title={t('app.changeAvatar')}
                  aria-label={`${t('app.changeAvatar')} · @${user.nickname}`}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev py-1 pr-3 pl-1 text-sm hover:border-amber/60',
                    focusRing,
                  )}
                  data-testid="user-badge"
                >
                  <AnimalAvatar avatar={user.avatar} size="sm" />
                  <span className="max-w-40 truncate font-semibold">@{user.nickname}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  aria-label={t('app.nav.logout')}
                  title={t('app.nav.logout')}
                  data-testid="logout"
                  className={pillButton}
                >
                  <LogOut className="size-5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                data-testid="login-link"
                className={cn(
                  'inline-flex h-11 items-center rounded-full border border-line bg-bg-elev px-4 text-sm font-semibold hover:bg-bg-elev-2',
                  focusRing,
                )}
              >
                {t('app.nav.login')}
              </Link>
            )}
          </div>

          {/* Mobile controls: avatar + burger */}
          <div className="ml-auto flex items-center gap-2 md:hidden">
            {user && (
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                aria-label={`${t('app.changeAvatar')} · @${user.nickname}`}
                title={t('app.changeAvatar')}
                data-testid="mobile-user-avatar"
                className={cn('inline-flex rounded-lg', focusRing)}
              >
                <AnimalAvatar avatar={user.avatar} size="md" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t('app.close') : t('app.menu')}
              data-testid="menu-toggle"
              className={cn(pillButton, 'text-fg')}
            >
              {menuOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <div
            id="mobile-menu"
            data-testid="mobile-menu"
            className="border-t border-line bg-bg/95 px-4 pt-3 pb-4 md:hidden"
          >
            <nav aria-label={t('app.menu')} className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/host'}
                  className={({ isActive }) =>
                    cn(
                      'rounded-xl px-3 py-2.5 text-base font-medium',
                      focusRing,
                      isActive ? 'bg-bg-elev-2 text-fg' : 'text-fg-muted',
                    )
                  }
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-fg-muted">{t('app.language')}</span>
                <LanguageSwitch />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-fg-muted">{t('app.sound')}</span>
                <SoundToggle />
              </div>
              {user ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                    <AnimalAvatar avatar={user.avatar} size="sm" label={user.nickname} />
                    <span className="truncate font-semibold">@{user.nickname}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    data-testid="mobile-logout"
                    className={cn(
                      'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line bg-bg-elev px-4 text-sm font-semibold text-fg-muted hover:text-fg',
                      focusRing,
                    )}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    {t('app.nav.logout')}
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  data-testid="mobile-login-link"
                  className={cn(
                    'inline-flex h-11 items-center justify-center rounded-xl bg-amber px-4 text-sm font-semibold text-fg-on-accent',
                    focusRing,
                  )}
                >
                  {t('app.nav.login')}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>
      {user && (
        <Modal
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          title={t('app.changeAvatar')}
          size="md"
          testId="avatar-modal"
        >
          <div className="flex flex-col items-center gap-5">
            <AnimalAvatar avatar={user.avatar} size="xl" label={user.nickname} />
            <AvatarPicker
              value={user.avatar}
              onChange={(a) => void pickAvatar(a)}
              className={cn('w-full', savingAvatar && 'pointer-events-none opacity-60')}
            />
          </div>
        </Modal>
      )}
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          !bare && 'mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8',
          bare && 'flex-1',
          className,
        )}
      >
        {children}
      </main>
    </div>
  )
}
