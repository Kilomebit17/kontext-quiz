import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Field'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { api } from '@/lib/api'

interface ChallengeModalProps {
  open: boolean
  onClose: () => void
  quizId: string | null
  title: string
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ChallengeModal({ open, onClose, quizId, title }: ChallengeModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const user = useAuthStore((s) => s.user)
  const [deadline, setDeadline] = useState(defaultDeadline)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setUrl(null)
    setError(null)
    setDeadline(defaultDeadline())
    onClose()
  }

  const create = async () => {
    if (!quizId) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.challenges.create({ quizId, deadline: new Date(deadline).toISOString() })
      setUrl(r.url)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('app.copied'))
    } catch {
      toast.error(t('app.error'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('host.challengeModal.title')}
      testId="challenge-modal"
      footer={
        url ? (
          <Button onClick={close}>{t('app.ok')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {t('app.cancel')}
            </Button>
            <Button
              onClick={() => void create()}
              loading={busy}
              disabled={!user}
              data-testid="create-challenge"
            >
              {busy ? t('host.challengeModal.creating') : t('host.challengeModal.create')}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-fg-muted">{t('host.challengeModal.text')}</p>
        {!user ? (
          <p className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
            {t('host.challengeModal.loginRequired')}{' '}
            <Link to="/login" className="font-semibold underline">
              {t('app.nav.login')}
            </Link>
          </p>
        ) : url ? (
          <div className="flex flex-col gap-2" data-testid="challenge-link">
            <span className="text-sm font-semibold text-fg-muted">
              {t('host.challengeModal.link')}
            </span>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-bg px-3 py-2.5 text-sm">
                {url}
              </code>
              <Button variant="secondary" onClick={() => void copy()} aria-label={t('app.copy')}>
                <Copy className="size-4" aria-hidden="true" />
                {t('app.copy')}
              </Button>
            </div>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-teal underline">
              {t('host.challengeModal.open')}
            </a>
          </div>
        ) : (
          <Input
            label={t('host.challengeModal.deadline')}
            type="datetime-local"
            value={deadline}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setDeadline(e.target.value)}
            error={error}
            data-testid="challenge-deadline"
          />
        )}
      </div>
    </Modal>
  )
}
