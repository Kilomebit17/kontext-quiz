import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff } from 'lucide-react'
import type { QuizSummary } from '@kontext/shared'
import { cn } from '@/lib/cn'

interface QuizCardProps {
  quiz: QuizSummary
  actions?: ReactNode
  meta?: ReactNode
  className?: string
  testId?: string
}

export function QuizCard({ quiz, actions, meta, className, testId }: QuizCardProps) {
  const { t } = useTranslation()
  return (
    <article
      data-testid={testId ?? 'quiz-card'}
      data-quiz-id={quiz.id}
      className={cn('card flex flex-col overflow-hidden', className)}
    >
      <div className="relative aspect-[16/7] w-full bg-bg-elev-2">
        {quiz.coverUrl ? (
          <img
            src={quiz.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div
            className="flex size-full items-center justify-center text-fg-muted/60"
            aria-hidden="true"
          >
            <ImageOff className="size-8" />
          </div>
        )}
        <span className="absolute right-3 bottom-3 rounded-full bg-bg/80 px-2.5 py-1 text-xs font-bold backdrop-blur">
          {t('count.questions', { count: quiz.questionCount })}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 text-lg leading-snug font-bold" title={quiz.title}>
          {quiz.title}
        </h3>
        {meta && <div className="text-sm text-fg-muted">{meta}</div>}
        {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </article>
  )
}
