import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface PinInputProps {
  value: string
  onChange: (pin: string) => void
  onComplete?: (pin: string) => void
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  id?: string
  describedBy?: string
}

const LENGTH = 6

/** Six large numeric boxes with auto-advance; behaves like one field for a11y. */
export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  id,
  describedBy,
}: PinInputProps) {
  const { t } = useTranslation()
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const [focused, setFocused] = useState<number | null>(null)
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  // Latest value, updated synchronously on commit: focus moves before the
  // parent re-renders, so onFocus can't rely on the `value` prop alone.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const commit = useCallback(
    (next: string) => {
      const clean = next.replace(/\D/g, '').slice(0, LENGTH)
      latest.current = clean
      onChange(clean)
      if (clean.length === LENGTH) onComplete?.(clean)
    },
    [onChange, onComplete],
  )

  const focusAt = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus()

  const handleInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, '')
    if (!typed) {
      commit(value.slice(0, i) + value.slice(i + 1))
      return
    }
    const next = (value.slice(0, i) + typed + value.slice(i + typed.length)).slice(0, LENGTH)
    commit(next)
    focusAt(Math.min(i + typed.length, LENGTH - 1))
  }

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) {
        commit(value.slice(0, i) + value.slice(i + 1))
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i))
        focusAt(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusAt(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusAt(i + 1)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    commit(text)
    focusAt(Math.min(text.replace(/\D/g, '').length, LENGTH - 1))
  }

  return (
    <div
      role="group"
      aria-label={t('landing.pinLabel')}
      aria-describedby={describedBy}
      data-testid="pin-input"
      className="flex items-center justify-center gap-2 sm:gap-3"
    >
      {digits.map((d, i) => (
        <span key={i} className="contents">
          {i === 3 && <span aria-hidden="true" className="w-2 sm:w-4" />}
          <input
            ref={(el) => {
              refs.current[i] = el
            }}
            id={i === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={LENGTH}
            value={d}
            disabled={disabled}
            aria-label={t('a11y.pinDigit', { n: i + 1 })}
            aria-invalid={invalid || undefined}
            data-testid={`pin-digit-${i}`}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => {
              // The PIN is one contiguous string, so a box past the first empty
              // one can't hold a digit: send focus to the first empty box instead
              // (clicking an already-filled box still lets you overwrite it).
              const target = Math.min(i, latest.current.length, LENGTH - 1)
              if (target !== i) {
                refs.current[target]?.focus()
                return
              }
              setFocused(i)
              e.target.select()
            }}
            onBlur={() => setFocused(null)}
            className={cn(
              'font-heading h-16 w-11 rounded-xl border-2 bg-bg-elev text-center text-3xl font-bold text-fg tabular caret-amber',
              'sm:h-20 sm:w-14 sm:text-4xl',
              'transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-amber',
              invalid ? 'border-error' : focused === i ? 'border-amber' : 'border-line',
              disabled && 'opacity-60',
            )}
          />
        </span>
      ))}
    </div>
  )
}
