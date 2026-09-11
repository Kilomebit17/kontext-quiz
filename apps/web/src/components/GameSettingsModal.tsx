import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DEFAULT_GAME_SETTINGS, type GameSettings, type QuizInput } from '@kontext/shared'
import { Modal } from './Modal'
import { Button } from './Button'
import { Select, Toggle } from './Field'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { storeHostToken } from '@/stores/gameStore'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { isLocalId } from '@/lib/ids'
import { localRepo, toInput } from '@/lib/quizRepo'
import { cn } from '@/lib/cn'

export interface GameTarget {
  /** Saved quiz id (local or API). */
  quizId?: string
  /** Inline quiz (unsaved editor content). */
  quiz?: QuizInput
  title: string
}

interface GameSettingsModalProps {
  open: boolean
  onClose: () => void
  target: GameTarget | null
}

export function GameSettingsModal({ open, onClose, target }: GameSettingsModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const user = useAuthStore((s) => s.user)
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (p: Partial<GameSettings>) => setSettings((s) => ({ ...s, ...p }))

  const start = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      let body: { quizId?: string; quiz?: QuizInput; settings: Partial<GameSettings> } = {
        settings,
      }
      if (target.quiz) body = { ...body, quiz: target.quiz }
      else if (target.quizId && (isLocalId(target.quizId) || !user)) {
        const local = await localRepo.get(target.quizId)
        if (!local) throw new Error('NOT_FOUND')
        body = { ...body, quiz: toInput(local) }
      } else if (target.quizId) body = { ...body, quizId: target.quizId }
      const r = await api.games.create(body)
      storeHostToken(r.sessionId, r.hostToken, r.joinUrl)
      onClose()
      navigate(`/host/game/${r.sessionId}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('host.settings.title')}
      testId="game-settings-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button onClick={() => void start()} loading={busy} data-testid="create-game">
            {busy ? t('host.settings.creating') : t('host.settings.start')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {target && <p className="font-semibold">{target.title}</p>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-fg-muted">
            {t('host.settings.mode')}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(['live', 'team'] as const).map((mode) => (
              <label
                key={mode}
                className={cn(
                  'flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-center font-semibold',
                  'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-amber',
                  settings.mode === mode ? 'border-amber bg-amber/15' : 'border-line bg-bg',
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  checked={settings.mode === mode}
                  onChange={() => patch({ mode })}
                  className="sr-only"
                  data-testid={`mode-${mode}`}
                />
                {t(`host.settings.${mode}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {settings.mode === 'team' && (
          <Select
            label={t('host.settings.teamSize')}
            value={settings.teamSize}
            onChange={(e) => patch({ teamSize: Number(e.target.value) })}
            data-testid="team-size"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
        <div className="divide-y divide-line">
          <Toggle
            label={t('host.settings.shuffleQuestions')}
            checked={settings.shuffleQuestions}
            onChange={(v) => patch({ shuffleQuestions: v })}
            testId="shuffle-questions"
          />
          <Toggle
            label={t('host.settings.shuffleOptions')}
            checked={settings.shuffleOptions}
            onChange={(v) => patch({ shuffleOptions: v })}
            testId="shuffle-options"
          />
          <Toggle
            label={t('host.settings.showQuestion')}
            checked={settings.showQuestionOnPlayer}
            onChange={(v) => patch({ showQuestionOnPlayer: v })}
            testId="show-question"
          />
          <Toggle
            label={t('host.settings.endWhenAllAnswered')}
            checked={settings.endWhenAllAnswered}
            onChange={(v) => patch({ endWhenAllAnswered: v })}
            testId="end-when-all-answered"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
