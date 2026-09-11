import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp } from 'lucide-react'
import type { Question } from '@kontext/shared'
import { Modal } from './Modal'
import { Button } from './Button'
import { parseImportFile, type ImportWarning } from '@/lib/import'
import { cn } from '@/lib/cn'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  mode: 'add' | 'create'
  onImport: (questions: Question[], fileName: string) => void | Promise<void>
}

export function ImportDialog({ open, onClose, mode, onImport }: ImportDialogProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<{
    questions: Question[]
    warnings: ImportWarning[]
    fileName: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return
    setParsing(true)
    setError(null)
    setResult(null)
    try {
      const r = await parseImportFile(file)
      if (r.questions.length === 0) setError(t('editor.import.empty'))
      setResult({ ...r, fileName: file.name })
    } catch {
      setError(t('editor.import.failed'))
    } finally {
      setParsing(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  const close = () => {
    setResult(null)
    setError(null)
    onClose()
  }

  const confirm = async () => {
    if (!result || result.questions.length === 0) return
    setBusy(true)
    try {
      await onImport(result.questions, result.fileName)
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('editor.import.title')}
      testId="import-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('app.cancel')}
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={!result || result.questions.length === 0}
            loading={busy}
            data-testid="import-confirm"
          >
            {mode === 'add' ? t('editor.import.add') : t('editor.import.createQuiz')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">{t('editor.import.text')}</p>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-amber bg-amber/10' : 'border-line',
          )}
        >
          <FileUp className="size-8 text-teal" aria-hidden="true" />
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()} loading={parsing}>
            {parsing ? t('editor.import.parsing') : t('editor.import.choose')}
          </Button>
          <span className="text-sm text-fg-muted">{t('editor.import.dropHint')}</span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {result && result.questions.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="import-preview">
            <p className="font-semibold">
              {t('editor.import.preview', { count: result.questions.length })}
            </p>
            <ul className="max-h-40 overflow-y-auto rounded-xl bg-bg p-3 text-sm">
              {result.questions.slice(0, 20).map((q, i) => (
                <li key={q.id} className="truncate py-0.5">
                  {i + 1}. {q.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result && result.warnings.length > 0 && (
          <div className="text-sm text-fg-muted">
            <p className="font-semibold">{t('editor.import.warnings')}</p>
            <p>{result.warnings.map((w) => w.row).join(', ')}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
