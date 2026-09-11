import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { shapeFor } from './shapes'

export type OptionOutcome = 'correct' | 'incorrect' | 'missed' | null

export interface OptionButtonProps {
  index: number
  text: string
  /** Hide the text (player screen in "shapes only" mode). */
  showText?: boolean
  selected?: boolean
  disabled?: boolean
  /** Reveal state. `missed` = correct but not chosen. */
  outcome?: OptionOutcome
  /** Larger typography for the projector. */
  size?: 'player' | 'host'
  /** Number of players that picked it (host reveal). */
  count?: number
  onClick?: () => void
  className?: string
  role?: 'button' | 'checkbox' | 'radio'
}

/** Answer tile: shape + color + text. Text hidden ⇒ the shape stays the label. */
export function OptionButton({
  index,
  text,
  showText = true,
  selected = false,
  disabled = false,
  outcome = null,
  size = 'player',
  count,
  onClick,
  className,
  role = 'button',
}: OptionButtonProps) {
  const { t } = useTranslation()
  const shape = shapeFor(index)
  const shapeName = t(`shapes.${shape.name}`)
  const label = showText && text ? t('play.answerLabel', { shape: shapeName, text }) : shapeName
  const dim = outcome === 'incorrect' || (outcome === null && disabled && !selected)
  const isHost = size === 'host'

  return (
    <button
      type="button"
      role={role === 'button' ? undefined : role}
      aria-checked={role === 'button' ? undefined : selected}
      aria-pressed={role === 'button' && onClick ? selected : undefined}
      aria-label={label}
      data-testid={`option-${index}`}
      data-selected={selected || undefined}
      data-outcome={outcome ?? undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-2xl text-left transition-[transform,opacity,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        shape.bg,
        shape.onBg,
        isHost ? 'p-5 md:p-7' : 'p-4',
        onClick && !disabled && 'active:scale-[0.98]',
        selected && 'ring-4 ring-fg ring-offset-2 ring-offset-bg',
        dim && 'opacity-40',
        outcome === 'correct' && 'ring-4 ring-fg shadow-[0_0_0_6px_rgb(61_220_151/0.55)]',
        outcome === 'missed' && 'ring-4 ring-success',
        disabled && !onClick && 'cursor-default',
        className,
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-black/15',
          isHost ? 'size-14 md:size-20' : showText ? 'size-12' : 'size-20',
        )}
        aria-hidden="true"
      >
        <shape.Icon
          className={cn(isHost ? 'size-9 md:size-12' : showText ? 'size-7' : 'size-12')}
        />
      </span>
      {showText ? (
        <span
          className={cn(
            'font-heading font-semibold break-words [overflow-wrap:anywhere]',
            isHost ? 'text-[clamp(1.25rem,2.4vw,2.4rem)] leading-tight' : 'text-lg leading-snug',
          )}
        >
          {text}
        </span>
      ) : (
        <span className="sr-only">{shapeName}</span>
      )}
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full bg-black/25 px-3 py-1 font-heading font-bold tabular',
            isHost ? 'text-2xl md:text-3xl' : 'text-base',
          )}
        >
          {count}
        </span>
      )}
      {outcome === 'correct' || outcome === 'missed' ? (
        <span
          className={cn(
            'absolute top-2 right-2 flex items-center justify-center rounded-full bg-success text-fg-on-accent',
            isHost ? 'size-10' : 'size-8',
          )}
        >
          <Check className={isHost ? 'size-6' : 'size-5'} aria-hidden="true" />
          <span className="sr-only">{t('a11y.optionCorrect')}</span>
        </span>
      ) : null}
      {outcome === 'incorrect' && selected ? (
        <span
          className={cn(
            'absolute top-2 right-2 flex items-center justify-center rounded-full bg-error text-fg-on-accent',
            isHost ? 'size-10' : 'size-8',
          )}
        >
          <X className={isHost ? 'size-6' : 'size-5'} aria-hidden="true" />
          <span className="sr-only">{t('a11y.optionIncorrect')}</span>
        </span>
      ) : null}
      {selected && outcome === null ? <span className="sr-only">{t('play.selected')}</span> : null}
    </button>
  )
}
