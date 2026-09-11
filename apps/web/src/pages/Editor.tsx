import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Copy, FileUp, Play, Plus, Save, Trash2, X } from 'lucide-react'
import {
  MAX_OPTION_TEXT,
  MAX_QUESTION_TEXT,
  MAX_QUIZ_TITLE,
  POINTS_MULTIPLIERS,
  TIME_LIMITS,
  quizInputSchema,
  type PointsMultiplier,
  type Question,
  type QuestionType,
  type QuizInput,
  type QuizOption,
  type QuizVisibility,
  type TimeLimit,
} from '@kontext/shared'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { Input, Select, Textarea } from '@/components/Field'
import { Media } from '@/components/Media'
import { PageSpinner } from '@/components/Spinner'
import { EmptyState } from '@/components/EmptyState'
import { ImportDialog } from '@/components/ImportDialog'
import { GameSettingsModal, type GameTarget } from '@/components/GameSettingsModal'
import { shapeFor } from '@/components/shapes'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useErrorMessage } from '@/hooks/useErrorMessage'
import { useQuizStore } from '@/stores/quizStore'
import { toast } from '@/stores/toastStore'
import { newId } from '@/lib/ids'
import { editorDraftKey, readJson, removeKey, writeJson } from '@/lib/storage'
import { detectMedia } from '@/lib/youtube'
import { cn } from '@/lib/cn'

type Draft = QuizInput & { visibility: QuizVisibility }

interface QuestionErrors {
  text?: string
  options?: string
  mediaUrl?: string
}

interface Errors {
  title?: string
  coverUrl?: string
  questions: Record<number, QuestionErrors>
}

const QUESTION_TYPES: QuestionType[] = ['single', 'multiple', 'truefalse', 'text', 'info']

function option(text = '', isCorrect = false): QuizOption {
  return { id: newId('o'), text, isCorrect }
}

function newQuestion(type: QuestionType = 'single'): Question {
  return {
    id: newId('q'),
    type,
    text: '',
    mediaUrl: null,
    options: optionsForType(type, []),
    timeLimit: 20,
    pointsMultiplier: 1,
  }
}

function optionsForType(type: QuestionType, prev: QuizOption[]): QuizOption[] {
  switch (type) {
    case 'single': {
      const base = prev.length >= 2 ? prev.slice(0, 4) : [option(), option(), option(), option()]
      const firstCorrect = base.findIndex((o) => o.isCorrect)
      return base.map((o, i) => ({
        ...o,
        isCorrect: i === (firstCorrect === -1 ? 0 : firstCorrect),
      }))
    }
    case 'multiple':
      return prev.length >= 2 ? prev.slice(0, 4) : [option(), option(), option(), option()]
    case 'truefalse':
      return [option('true', true), option('false', false)]
    case 'text':
      return prev.length > 0 && prev.every((o) => o.text.trim())
        ? prev.map((o) => ({ ...o, isCorrect: true }))
        : [option('', true)]
    case 'info':
      return []
  }
}

function emptyDraft(): Draft {
  return { title: '', coverUrl: null, visibility: 'private', questions: [newQuestion()] }
}

function quizToDraft(quiz: {
  title: string
  coverUrl?: string | null
  visibility: QuizVisibility
  questions: Question[]
}): Draft {
  return {
    title: quiz.title,
    coverUrl: quiz.coverUrl ?? null,
    visibility: quiz.visibility,
    questions: quiz.questions,
  }
}

function validate(
  draft: Draft,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Errors {
  const errors: Errors = { questions: {} }
  const parsed = quizInputSchema.safeParse(draft)
  if (parsed.success) return errors
  for (const issue of parsed.error.issues) {
    const [root, idx, field] = issue.path
    if (root === 'title') errors.title = t('editor.validation.title')
    else if (root === 'coverUrl') errors.coverUrl = t('editor.validation.coverUrl')
    else if (root === 'questions' && typeof idx === 'number') {
      const q = draft.questions[idx]
      const qe = (errors.questions[idx] ??= {})
      if (field === 'text' || field === undefined) {
        qe.text =
          q && q.text.length > MAX_QUESTION_TEXT
            ? t('editor.validation.questionTooLong', { max: MAX_QUESTION_TEXT })
            : t('editor.validation.questionText')
      } else if (field === 'mediaUrl') qe.mediaUrl = t('editor.validation.mediaUrl')
      else if (field === 'options') {
        if (!q) continue
        if (q.type === 'text') qe.options = t('editor.validation.accepted')
        else if (q.type === 'multiple')
          qe.options = q.options.some((o) => o.isCorrect)
            ? t('editor.validation.options')
            : t('editor.validation.someCorrect')
        else
          qe.options =
            q.options.filter((o) => o.isCorrect).length === 1
              ? t('editor.validation.options')
              : t('editor.validation.oneCorrect')
      }
    }
  }
  return errors
}

export default function Editor() {
  const { t } = useTranslation()
  usePageTitle(t('titles.editor'))
  const { id } = useParams()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const getQuiz = useQuizStore((s) => s.get)
  const createQuiz = useQuizStore((s) => s.create)
  const updateQuiz = useQuizStore((s) => s.update)
  const draftKey = editorDraftKey(id ?? 'new')

  // A new quiz starts synchronously (from the local draft, if any); an existing quiz is fetched.
  const [draft, setDraft] = useState<Draft | null>(() =>
    id ? null : (readJson<Draft>('local', draftKey) ?? emptyDraft()),
  )
  const [selectedId, setSelectedId] = useState<string | null>(() => draft?.questions[0]?.id ?? null)
  const [draftRestored, setDraftRestored] = useState(
    () => !id && readJson<Draft>('local', draftKey) !== null,
  )
  const [dirty, setDirty] = useState(draftRestored)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [gameTarget, setGameTarget] = useState<GameTarget | null>(null)
  const loadedFor = useRef<string | null>(id ? null : 'new')

  // Load an existing quiz (or its unsaved draft).
  useEffect(() => {
    if (!id || loadedFor.current === id) return
    loadedFor.current = id
    const stored = readJson<Draft>('local', draftKey)
    void getQuiz(id).then((quiz) => {
      if (!quiz) {
        setNotFound(true)
        return
      }
      const base = quizToDraft(quiz)
      const useStored = stored && JSON.stringify(stored) !== JSON.stringify(base)
      const initial = useStored ? stored : base
      setDraft(initial)
      setSelectedId(initial.questions[0]?.id ?? null)
      setDraftRestored(Boolean(useStored))
      setDirty(Boolean(useStored))
    })
  }, [id, draftKey, getQuiz])

  // Autosave draft.
  useEffect(() => {
    if (!draft || !dirty) return
    const handle = window.setTimeout(() => writeJson('local', draftKey, draft), 300)
    return () => window.clearTimeout(handle)
  }, [draft, dirty, draftKey])

  const errors = useMemo(() => (draft ? validate(draft, t) : { questions: {} }), [draft, t])
  const hasErrors = Boolean(
    errors.title || errors.coverUrl || Object.keys(errors.questions).length > 0,
  )

  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d))
    setDirty(true)
  }, [])

  const updateQuestion = useCallback(
    (qid: string, fn: (q: Question) => Question) =>
      update((d) => ({ ...d, questions: d.questions.map((q) => (q.id === qid ? fn(q) : q)) })),
    [update],
  )

  const addQuestion = (type: QuestionType = 'single') => {
    const q = newQuestion(type)
    update((d) => ({ ...d, questions: [...d.questions, q] }))
    setSelectedId(q.id)
  }

  const moveQuestion = (index: number, dir: -1 | 1) =>
    update((d) => {
      const next = [...d.questions]
      const target = index + dir
      if (target < 0 || target >= next.length) return d
      const a = next[index] as Question
      next[index] = next[target] as Question
      next[target] = a
      return { ...d, questions: next }
    })

  const duplicateQuestion = (q: Question) => {
    const copy: Question = {
      ...q,
      id: newId('q'),
      options: q.options.map((o) => ({ ...o, id: newId('o') })),
    }
    update((d) => {
      const i = d.questions.findIndex((x) => x.id === q.id)
      const next = [...d.questions]
      next.splice(i + 1, 0, copy)
      return { ...d, questions: next }
    })
    setSelectedId(copy.id)
  }

  const deleteQuestion = (qid: string) => {
    update((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== qid) }))
    if (selectedId === qid) setSelectedId(draft?.questions.find((q) => q.id !== qid)?.id ?? null)
  }

  const save = async (): Promise<string | null> => {
    if (!draft) return null
    setShowErrors(true)
    if (hasErrors) {
      toast.error(t('editor.validation.fixErrors'))
      return null
    }
    setSaving(true)
    try {
      const input: QuizInput = { ...draft, title: draft.title.trim() }
      const saved = id ? await updateQuiz(id, input) : await createQuiz(input)
      removeKey('local', draftKey)
      setDirty(false)
      setDraftRestored(false)
      toast.success(t('editor.saved'))
      if (!id) {
        removeKey('local', editorDraftKey('new'))
        loadedFor.current = saved.id
        navigate(`/host/quiz/${saved.id}`, { replace: true })
      }
      return saved.id
    } catch (err) {
      toast.error(errorMessage(err))
      return null
    } finally {
      setSaving(false)
    }
  }

  const startGame = async () => {
    if (!draft) return
    if (draft.questions.length === 0) {
      toast.error(t('editor.validation.noQuestions'))
      return
    }
    const savedId = dirty || !id ? await save() : id
    if (!savedId) return
    setGameTarget({ quizId: savedId, title: draft.title })
  }

  const discardDraft = () => {
    removeKey('local', draftKey)
    setDraftRestored(false)
    setDirty(false)
    if (!id) {
      const initial = emptyDraft()
      setDraft(initial)
      setSelectedId(initial.questions[0]?.id ?? null)
      return
    }
    setDraft(null)
    void getQuiz(id).then((quiz) => {
      if (!quiz) return
      const base = quizToDraft(quiz)
      setDraft(base)
      setSelectedId(base.questions[0]?.id ?? null)
    })
  }

  if (notFound) {
    return (
      <AppShell>
        <EmptyState
          title={t('solo.notFound')}
          action={
            <Link to="/host" className="font-semibold underline">
              {t('editor.backToList')}
            </Link>
          }
        />
      </AppShell>
    )
  }
  if (!draft) {
    return (
      <AppShell>
        <PageSpinner />
      </AppShell>
    )
  }

  const selected = draft.questions.find((q) => q.id === selectedId) ?? null
  const selectedIndex = selected ? draft.questions.indexOf(selected) : -1

  return (
    <AppShell>
      <div className="flex flex-col gap-5" data-testid="editor">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/host" className="text-sm text-fg-muted hover:text-fg">
            ← {t('editor.backToList')}
          </Link>
          <h1 className="sr-only">
            {id ? draft.title || t('titles.editor') : t('editor.newTitle')}
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {dirty && <span className="text-sm text-fg-muted">{t('editor.unsaved')}</span>}
            <Button
              variant="secondary"
              onClick={() => setImportOpen(true)}
              data-testid="editor-import"
            >
              <FileUp className="size-4" aria-hidden="true" />
              {t('host.import')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void save()}
              loading={saving}
              data-testid="editor-save"
            >
              <Save className="size-4" aria-hidden="true" />
              {saving ? t('editor.saving') : t('editor.save')}
            </Button>
            <Button onClick={() => void startGame()} disabled={saving} data-testid="editor-start">
              <Play className="size-4" aria-hidden="true" />
              {t('editor.startGame')}
            </Button>
          </div>
        </div>

        {draftRestored && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal/40 bg-teal/10 px-4 py-3 text-sm"
            data-testid="draft-restored"
          >
            <span className="flex-1">{t('editor.draftRestored')}</span>
            <Button size="sm" variant="ghost" onClick={discardDraft}>
              {t('editor.discardDraft')}
            </Button>
          </div>
        )}

        <section className="card grid gap-4 p-5 md:grid-cols-[2fr_2fr_1fr]">
          <Input
            label={t('editor.titleLabel')}
            placeholder={t('editor.titlePlaceholder')}
            value={draft.title}
            maxLength={MAX_QUIZ_TITLE}
            onChange={(e) => update((d) => ({ ...d, title: e.target.value }))}
            error={showErrors ? errors.title : undefined}
            data-testid="quiz-title"
          />
          <Input
            label={t('editor.coverLabel')}
            placeholder={t('editor.mediaPlaceholder')}
            type="url"
            value={draft.coverUrl ?? ''}
            onChange={(e) => update((d) => ({ ...d, coverUrl: e.target.value.trim() || null }))}
            error={showErrors ? errors.coverUrl : undefined}
            data-testid="quiz-cover"
          />
          <Select
            label={t('editor.visibilityLabel')}
            value={draft.visibility}
            onChange={(e) =>
              update((d) => ({ ...d, visibility: e.target.value as QuizVisibility }))
            }
            data-testid="quiz-visibility"
            hint={t(`editor.visibilityHint.${draft.visibility}`)}
          >
            {(['private', 'public', 'link'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`host.visibility.${v}`)}
              </option>
            ))}
          </Select>
        </section>

        {/* min-w-0 on the grid children: otherwise wide rows (option inputs) stretch the column past the viewport on phones. */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[18rem_1fr]">
          <aside
            className="card flex min-w-0 flex-col gap-3 p-4"
            aria-label={t('editor.questions')}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{t('editor.questions')}</h2>
              <span className="text-sm text-fg-muted">
                {t('count.questions', { count: draft.questions.length })}
              </span>
            </div>
            <ol
              className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto"
              data-testid="question-list"
            >
              {draft.questions.map((q, i) => {
                const hasErr = showErrors && Boolean(errors.questions[i])
                return (
                  <li key={q.id}>
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-xl border px-2 py-1.5',
                        q.id === selectedId
                          ? 'border-amber bg-amber/10'
                          : 'border-transparent hover:bg-fg/5',
                        hasErr && 'border-error/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(q.id)}
                        aria-current={q.id === selectedId ? 'true' : undefined}
                        data-testid={`question-item-${i}`}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none"
                      >
                        <span className="font-heading w-6 shrink-0 text-center text-sm font-bold tabular text-fg-muted">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {q.text || t('editor.untitledQuestion')}
                          </span>
                          <span className="block truncate text-xs text-fg-muted">
                            {t(`editor.types.${q.type}`)}
                          </span>
                        </span>
                      </button>
                      <IconButton
                        label={t('editor.moveUp')}
                        disabled={i === 0}
                        onClick={() => moveQuestion(i, -1)}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={t('editor.moveDown')}
                        disabled={i === draft.questions.length - 1}
                        onClick={() => moveQuestion(i, 1)}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ol>
            <Button variant="secondary" onClick={() => addQuestion()} data-testid="add-question">
              <Plus className="size-4" aria-hidden="true" />
              {t('editor.addQuestion')}
            </Button>
          </aside>

          <section
            className="card flex min-w-0 flex-col gap-5 p-4 sm:p-5"
            aria-label={
              selected ? t('editor.questionN', { n: selectedIndex + 1 }) : t('editor.questions')
            }
          >
            {selected ? (
              <QuestionForm
                key={selected.id}
                index={selectedIndex}
                question={selected}
                errors={showErrors ? errors.questions[selectedIndex] : undefined}
                onChange={(fn) => updateQuestion(selected.id, fn)}
                onDuplicate={() => duplicateQuestion(selected)}
                onDelete={() => deleteQuestion(selected.id)}
              />
            ) : (
              <EmptyState
                title={t('editor.noQuestionSelected')}
                action={<Button onClick={() => addQuestion()}>{t('editor.addQuestion')}</Button>}
              />
            )}
          </section>
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        mode="add"
        onImport={(questions) => {
          update((d) => ({ ...d, questions: [...d.questions, ...questions] }))
          const first = questions[0]
          if (first) setSelectedId(first.id)
        }}
      />
      <GameSettingsModal
        open={gameTarget !== null}
        onClose={() => setGameTarget(null)}
        target={gameTarget}
      />
    </AppShell>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-fg/10 hover:text-fg disabled:opacity-30',
        'focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none',
        danger && 'hover:text-error',
      )}
    >
      {children}
    </button>
  )
}

interface QuestionFormProps {
  index: number
  question: Question
  errors?: QuestionErrors
  onChange: (fn: (q: Question) => Question) => void
  onDuplicate: () => void
  onDelete: () => void
}

function QuestionForm({
  index,
  question,
  errors,
  onChange,
  onDuplicate,
  onDelete,
}: QuestionFormProps) {
  const { t } = useTranslation()
  const media = detectMedia(question.mediaUrl)

  const setType = (type: QuestionType) =>
    onChange((q) => ({ ...q, type, options: optionsForType(type, q.options) }))
  const setOption = (oid: string, patch: Partial<QuizOption>) =>
    onChange((q) => ({
      ...q,
      options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)),
    }))
  const setCorrectSingle = (oid: string) =>
    onChange((q) => ({ ...q, options: q.options.map((o) => ({ ...o, isCorrect: o.id === oid })) }))
  const addOption = () =>
    onChange((q) =>
      q.options.length < 4 ? { ...q, options: [...q.options, option('', q.type === 'text')] } : q,
    )
  const addAccepted = () =>
    onChange((q) =>
      q.options.length < 10 ? { ...q, options: [...q.options, option('', true)] } : q,
    )
  const removeOption = (oid: string) =>
    onChange((q) => ({ ...q, options: q.options.filter((o) => o.id !== oid) }))

  return (
    <div className="flex flex-col gap-5" data-testid="question-form">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{t('editor.questionN', { n: index + 1 })}</h2>
        <div className="ml-auto flex gap-1">
          <IconButton label={t('editor.duplicateQuestion')} onClick={onDuplicate}>
            <Copy className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={t('editor.deleteQuestion')} onClick={onDelete} danger>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {/* Fieldsets default to min-width: min-content, which breaks phone layouts. */}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold text-fg-muted">{t('editor.type')}</legend>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((type) => (
            <label
              key={type}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-amber',
                question.type === type ? 'border-amber bg-amber/15' : 'border-line bg-bg',
              )}
            >
              <input
                type="radio"
                name={`type-${question.id}`}
                value={type}
                checked={question.type === type}
                onChange={() => setType(type)}
                className="sr-only"
                data-testid={`type-${type}`}
              />
              {t(`editor.types.${type}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <Textarea
        label={t('editor.textLabel')}
        placeholder={t('editor.textPlaceholder')}
        value={question.text}
        maxLength={MAX_QUESTION_TEXT}
        rows={2}
        onChange={(e) => onChange((q) => ({ ...q, text: e.target.value }))}
        error={errors?.text}
        trailing={
          <span
            className={cn(
              'text-xs tabular',
              question.text.length >= MAX_QUESTION_TEXT ? 'text-error' : 'text-fg-muted',
            )}
            aria-live="polite"
          >
            {t('editor.charCount', { count: question.text.length, max: MAX_QUESTION_TEXT })}
          </span>
        }
        data-testid="question-text"
      />

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Input
          label={t('editor.mediaLabel')}
          placeholder={t('editor.mediaPlaceholder')}
          type="url"
          value={question.mediaUrl ?? ''}
          onChange={(e) => onChange((q) => ({ ...q, mediaUrl: e.target.value.trim() || null }))}
          error={errors?.mediaUrl}
          hint={
            media.kind === 'youtube'
              ? t('editor.mediaYoutube')
              : media.kind === 'image'
                ? t('editor.mediaImage')
                : undefined
          }
          data-testid="question-media"
        />
        {media.kind !== 'none' && (
          <div className="w-full md:w-48">
            <Media url={question.mediaUrl} className="max-h-28" />
          </div>
        )}
      </div>

      {question.type === 'info' ? (
        <p className="rounded-xl bg-bg px-4 py-3 text-sm text-fg-muted">{t('editor.infoHint')}</p>
      ) : question.type === 'text' ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-fg-muted">
            {t('editor.acceptedAnswers')}
          </legend>
          <p className="text-sm text-fg-muted">{t('editor.acceptedHint')}</p>
          {question.options.map((o, i) => (
            <div key={o.id} className="flex min-w-0 items-center gap-2">
              <input
                type="text"
                value={o.text}
                maxLength={MAX_OPTION_TEXT}
                placeholder={t('editor.acceptedPlaceholder')}
                aria-label={`${t('editor.acceptedAnswers')} ${i + 1}`}
                onChange={(e) => setOption(o.id, { text: e.target.value })}
                data-testid={`accepted-${i}`}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60"
              />
              <IconButton
                label={t('editor.removeOption')}
                onClick={() => removeOption(o.id)}
                disabled={question.options.length <= 1}
                danger
              >
                <X className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
          ))}
          {errors?.options && (
            <p role="alert" className="text-sm text-error">
              {errors.options}
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={addAccepted}
            disabled={question.options.length >= 10}
            className="self-start"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('editor.addAccepted')}
          </Button>
        </fieldset>
      ) : (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-fg-muted">
            {t('editor.options')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((o, i) => {
              const shape = shapeFor(i)
              const isTF = question.type === 'truefalse'
              const label = isTF ? (i === 0 ? t('editor.true') : t('editor.false')) : o.text
              return (
                <div
                  key={o.id}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-2xl border p-2',
                    o.isCorrect ? 'border-success/60 bg-success/10' : 'border-line',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      shape.bg,
                      shape.onBg,
                    )}
                    aria-hidden="true"
                  >
                    <shape.Icon className="size-5" />
                  </span>
                  {isTF ? (
                    <span className="min-w-0 flex-1 px-1 font-semibold">{label}</span>
                  ) : (
                    <input
                      type="text"
                      value={o.text}
                      maxLength={MAX_OPTION_TEXT}
                      placeholder={t('editor.optionPlaceholder')}
                      aria-label={t('editor.optionN', { n: i + 1 })}
                      onChange={(e) => setOption(o.id, { text: e.target.value })}
                      data-testid={`option-text-${i}`}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-bg px-2 focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60"
                    />
                  )}
                  <label
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg-muted"
                    title={t('editor.markCorrect')}
                  >
                    <input
                      type={question.type === 'multiple' ? 'checkbox' : 'radio'}
                      name={`correct-${question.id}`}
                      checked={o.isCorrect}
                      onChange={(e) =>
                        question.type === 'multiple'
                          ? setOption(o.id, { isCorrect: e.target.checked })
                          : setCorrectSingle(o.id)
                      }
                      aria-label={t('editor.markCorrect')}
                      data-testid={`option-correct-${i}`}
                      className="size-5 accent-[var(--success)]"
                    />
                    {/* The word only fits next to the input from tablet width up. */}
                    <span className="hidden sm:inline">{t('editor.markCorrect')}</span>
                  </label>
                  {!isTF && (
                    <IconButton
                      label={t('editor.removeOption')}
                      onClick={() => removeOption(o.id)}
                      disabled={question.options.length <= 2}
                      danger
                    >
                      <X className="size-4" aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              )
            })}
          </div>
          {errors?.options && (
            <p role="alert" className="text-sm text-error">
              {errors.options}
            </p>
          )}
          {question.type !== 'truefalse' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={addOption}
              disabled={question.options.length >= 4}
              className="self-start"
              data-testid="add-option"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('editor.addOption')}
            </Button>
          )}
        </fieldset>
      )}

      {question.type !== 'info' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('editor.timeLimit')}
            value={question.timeLimit}
            onChange={(e) =>
              onChange((q) => ({ ...q, timeLimit: Number(e.target.value) as TimeLimit }))
            }
            data-testid="time-limit"
          >
            {TIME_LIMITS.map((s) => (
              <option key={s} value={s}>
                {t('editor.seconds', { count: s })}
              </option>
            ))}
          </Select>
          <Select
            label={t('editor.points')}
            value={question.pointsMultiplier}
            onChange={(e) =>
              onChange((q) => ({
                ...q,
                pointsMultiplier: Number(e.target.value) as PointsMultiplier,
              }))
            }
            data-testid="points"
          >
            {POINTS_MULTIPLIERS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t('editor.pointsNone') : t('editor.pointsX', { n: m })}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}
