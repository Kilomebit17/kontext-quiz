import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Copy, FileUp, Link2, Pencil, Play, Plus, Trash2, User } from 'lucide-react'
import type { Question, QuizSummary } from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { QuizCard } from '@/components/QuizCard'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { PageSpinner } from '@/components/Spinner'
import { GameSettingsModal, type GameTarget } from '@/components/GameSettingsModal'
import { ChallengeModal } from '@/components/ChallengeModal'
import { ImportDialog } from '@/components/ImportDialog'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useAuthStore } from '@/stores/authStore'
import { useQuizStore } from '@/stores/quizStore'
import { toast } from '@/stores/toastStore'

export default function HostDashboard() {
  const { t } = useTranslation()
  usePageTitle(t('titles.host'))
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const quizzes = useQuizStore((s) => s.quizzes)
  const status = useQuizStore((s) => s.status)
  const load = useQuizStore((s) => s.load)
  const remove = useQuizStore((s) => s.remove)
  const duplicate = useQuizStore((s) => s.duplicate)
  const create = useQuizStore((s) => s.create)
  const localCount = useQuizStore((s) => s.localCount)
  const importLocal = useQuizStore((s) => s.importLocalToAccount)
  const [gameTarget, setGameTarget] = useState<GameTarget | null>(null)
  const [challengeTarget, setChallengeTarget] = useState<QuizSummary | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [localImported, setLocalImported] = useState(false)
  const localPending = user && !localImported ? localCount() : 0

  useEffect(() => {
    if (authStatus === 'ready' || authStatus === 'error') void load()
  }, [authStatus, user, load])

  const onDelete = async (quiz: QuizSummary) => {
    if (!window.confirm(t('host.confirmDelete', { title: quiz.title }))) return
    try {
      await remove(quiz.id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onDuplicate = async (quiz: QuizSummary) => {
    try {
      await duplicate(quiz.id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const onImportLocal = async () => {
    setImporting(true)
    try {
      await importLocal()
      setLocalImported(true)
      toast.success(t('host.importLocalDone'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  const onImportFile = async (questions: Question[], fileName: string) => {
    const title = fileName.replace(/\.(csv|xlsx|xls)$/i, '').slice(0, 80) || t('editor.newTitle')
    try {
      const quiz = await create({ title, coverUrl: null, visibility: 'private', questions })
      navigate(`/host/quiz/${quiz.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const loading =
    authStatus === 'idle' ||
    authStatus === 'loading' ||
    (status === 'loading' && quizzes.length === 0)

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{t('host.heading')}</h1>
          {/* Mobile: one row, import 30% / new quiz 70%; wider screens: natural widths. */}
          <div className="grid w-full grid-cols-[3fr_7fr] gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              data-testid="import-quiz"
              className="w-full justify-center sm:w-auto"
            >
              <FileUp className="size-4" aria-hidden="true" />
              <span className="sm:hidden">{t('host.importShort')}</span>
              <span className="hidden sm:inline">{t('host.import')}</span>
            </Button>
            <Link
              to="/host/quiz/new"
              data-testid="new-quiz"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber px-3 font-medium whitespace-nowrap text-fg-on-accent hover:brightness-110 focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none sm:w-auto"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('host.newQuiz')}
            </Link>
          </div>
        </div>

        {!user && authStatus !== 'idle' && authStatus !== 'loading' && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm"
            data-testid="guest-banner"
          >
            <User className="size-4 shrink-0 text-amber" aria-hidden="true" />
            <span className="flex-1">{t('host.guestBanner')}</span>
            <Link to="/login" className="font-semibold underline">
              {t('host.guestBannerAction')}
            </Link>
          </div>
        )}

        {user && localPending > 0 && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal/40 bg-teal/10 px-4 py-3 text-sm"
            data-testid="import-local-banner"
          >
            <div className="flex-1">
              <p className="font-semibold">{t('host.importLocalTitle')}</p>
              <p>{t('host.importLocalText', { count: localPending })}</p>
            </div>
            <Button
              size="sm"
              variant="teal"
              loading={importing}
              onClick={() => void onImportLocal()}
            >
              {t('host.importLocalAction')}
            </Button>
          </div>
        )}

        {loading ? (
          <PageSpinner />
        ) : quizzes.length === 0 ? (
          <EmptyState
            title={t('host.empty')}
            text={t('host.emptyHint')}
            testId="quiz-empty"
            action={
              <Link
                to="/host/quiz/new"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber px-4 font-medium text-fg-on-accent"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('host.newQuiz')}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="quiz-grid">
            {quizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                meta={t(`host.visibility.${quiz.visibility}`)}
                actions={
                  <div
                    className="flex w-full flex-col gap-2"
                    aria-label={t('host.menuLabel', { title: quiz.title })}
                  >
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => setGameTarget({ quizId: quiz.id, title: quiz.title })}
                        disabled={quiz.questionCount === 0}
                        data-testid="quiz-play"
                      >
                        <Play className="size-4" aria-hidden="true" />
                        {t('host.play')}
                      </Button>
                      <Link
                        to={`/host/quiz/${quiz.id}`}
                        data-testid="quiz-edit"
                        aria-label={t('host.edit')}
                        title={t('host.edit')}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-bg-elev-2 hover:bg-[#2b3668] focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                      >
                        <Pencil className="size-5" aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void onDelete(quiz)}
                        data-testid="quiz-delete"
                        aria-label={t('host.delete')}
                        title={t('host.delete')}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-error/40 bg-error/10 text-error hover:bg-error/20 focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                      >
                        <Trash2 className="size-5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Link
                        to={`/solo/${quiz.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-fg/10 hover:text-fg focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                      >
                        <User className="size-4" aria-hidden="true" />
                        {t('host.solo')}
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-fg-muted"
                        onClick={() => setChallengeTarget(quiz)}
                      >
                        <Link2 className="size-4" aria-hidden="true" />
                        {t('host.challenge')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-fg-muted"
                        onClick={() => void onDuplicate(quiz)}
                      >
                        <Copy className="size-4" aria-hidden="true" />
                        {t('host.duplicate')}
                      </Button>
                    </div>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>

      <GameSettingsModal
        open={gameTarget !== null}
        onClose={() => setGameTarget(null)}
        target={gameTarget}
      />
      <ChallengeModal
        key={challengeTarget?.id ?? 'none'}
        open={challengeTarget !== null}
        onClose={() => setChallengeTarget(null)}
        quizId={challengeTarget?.id ?? null}
        title={challengeTarget?.title ?? ''}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        mode="create"
        onImport={onImportFile}
      />
    </AppShell>
  )
}
