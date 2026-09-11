import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import {
  formatPin,
  isValidPin,
  MAX_NICKNAME,
  randomAvatar,
  validateNickname,
} from '@kontext/shared'
import { PlayerShell } from '@/components/PlayerShell'
import { AvatarPicker } from '@/components/AvatarPicker'
import { Input } from '@/components/Field'
import { Button } from '@/components/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useGameStore } from '@/stores/gameStore'
import { api } from '@/lib/api'
import { unlockAudio } from '@/lib/sound'

export default function Join() {
  const { t } = useTranslation()
  usePageTitle(t('titles.join'))
  const [params] = useSearchParams()
  const pin = params.get('pin') ?? ''
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const joinAsPlayer = useGameStore((s) => s.joinAsPlayer)
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState<string>(() => randomAvatar())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [quizTitle, setQuizTitle] = useState<string | null>(null)

  useEffect(() => {
    if (!isValidPin(pin)) return
    let cancelled = false
    api.games
      .lookupPin(pin)
      .then((r) => {
        if (!cancelled && r.exists && r.quizTitle) setQuizTitle(r.quizTitle)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pin])

  if (!isValidPin(pin)) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = validateNickname(nickname)
    if (!v.ok) {
      setError(t(`errors.${v.error}`))
      return
    }
    unlockAudio()
    setBusy(true)
    setError(null)
    try {
      await joinAsPlayer(pin, v.nickname, null, avatar)
      navigate('/play', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PlayerShell showLanguage>
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
            {t('join.pin')}
          </span>
          <span
            className="font-heading text-4xl font-extrabold tabular tracking-[0.15em]"
            data-testid="join-pin"
          >
            {formatPin(pin)}
          </span>
          {quizTitle && (
            <span className="text-fg-muted" data-testid="join-quiz-title">
              {t('join.quiz')}: {quizTitle}
            </span>
          )}
        </div>
        <h1 className="text-center text-2xl font-bold">{t('join.heading')}</h1>
        <Input
          label={t('join.nicknameLabel')}
          placeholder={t('join.nicknamePlaceholder')}
          hint={t('join.nicknameHint')}
          error={error}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value)
            setError(null)
          }}
          maxLength={MAX_NICKNAME}
          autoComplete="nickname"
          autoCapitalize="words"
          autoFocus
          enterKeyHint="go"
          data-testid="nickname-input"
          className="h-14 text-xl"
        />

        <fieldset className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-semibold text-fg-muted">{t('join.avatarLabel')}</legend>
            <button
              type="button"
              onClick={() => setAvatar(randomAvatar())}
              data-testid="shuffle-avatar"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-bg-elev px-3 text-sm font-semibold text-fg-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
            >
              <Dices className="size-4" aria-hidden="true" />
              {t('join.shuffleAvatar')}
            </button>
          </div>
          <AvatarPicker value={avatar} onChange={setAvatar} size="lg" />
        </fieldset>

        <Button type="submit" size="xl" block loading={busy} data-testid="join-submit">
          {busy ? t('join.joining') : t('join.submit')}
        </Button>
        <Link
          to="/"
          className="text-center text-sm text-fg-muted hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none rounded"
        >
          {t('join.changePin')}
        </Link>
      </form>
    </PlayerShell>
  )
}
