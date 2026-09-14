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
        'relative block w-full overflow-hidden rounded-2xl text-left transition-[transform,opacity,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        shape.bg,
        shape.onBg,
        // Host tiles size to their OWN width (container queries), not the viewport: the same tile
        // is ~900px wide on the question screen but ~300px in the reveal's two-column list.
        isHost && '@container',
        onClick && !disabled && 'active:scale-[0.98]',
        selected && 'ring-4 ring-fg ring-offset-2 ring-offset-bg',
        dim && 'opacity-40',
        outcome === 'correct' && 'ring-4 ring-fg shadow-[0_0_0_6px_rgb(61_220_151/0.55)]',
        outcome === 'missed' && 'ring-4 ring-success',
        disabled && !onClick && 'cursor-default',
        className,
      )}
    >
      {/* Layout lives on an inner row: a container can't query its own size, so the padding
          that depends on the tile width has to sit one level down. */}
      <span
        className={cn(
          'flex min-h-11 w-full items-center gap-3',
          isHost ? 'p-3 @md:p-5 @2xl:p-7' : 'p-4',
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl bg-black/15',
            isHost ? 'size-10 @md:size-14 @2xl:size-20' : showText ? 'size-12' : 'size-20',
          )}
          aria-hidden="true"
        >
          <shape.Icon
            className={cn(
              isHost ? 'size-6 @md:size-9 @2xl:size-12' : showText ? 'size-7' : 'size-12',
            )}
          />
        </span>
        {showText ? (
          <span
            className={cn(
              // min-w-0 lets long answers wrap instead of pushing the vote count out of the tile.
              'min-w-0 flex-1 font-heading font-semibold break-words [overflow-wrap:anywhere]',
              isHost ? 'text-[clamp(1.125rem,5cqi,2.4rem)] leading-tight' : 'text-lg leading-snug',
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
              isHost ? 'text-lg @md:text-2xl @2xl:text-3xl' : 'text-base',
            )}
          >
            {count}
          </span>
        )}
        {outcome === 'correct' || outcome === 'missed' ? (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-success text-fg-on-accent',
              // Host tiles carry a vote count on the right, so a corner badge would sit on it;
              // there the badge joins the row after the count. Player tiles keep the corner.
              isHost ? 'size-8 @md:size-10 @2xl:size-12' : 'absolute top-2 right-2 size-8',
            )}
          >
            <Check
              className={isHost ? 'size-5 @md:size-6 @2xl:size-7' : 'size-5'}
              aria-hidden="true"
            />
            <span className="sr-only">{t('a11y.optionCorrect')}</span>
          </span>
        ) : null}
        {outcome === 'incorrect' && selected ? (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-error text-fg-on-accent',
              isHost ? 'size-8 @md:size-10 @2xl:size-12' : 'absolute top-2 right-2 size-8',
            )}
          >
            <X className={isHost ? 'size-5 @md:size-6 @2xl:size-7' : 'size-5'} aria-hidden="true" />
            <span className="sr-only">{t('a11y.optionIncorrect')}</span>
          </span>
        ) : null}
        {selected && outcome === null ? (
          <span className="sr-only">{t('play.selected')}</span>
        ) : null}
      </span>
    </button>
  )
}
