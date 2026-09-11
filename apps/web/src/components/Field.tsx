import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-base text-fg placeholder:text-fg-muted/70 transition-colors focus:border-amber focus:outline-none focus-visible:ring-4 focus-visible:ring-amber/60 disabled:opacity-60 aria-[invalid=true]:border-error'

interface FieldWrapProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor: string
  children: ReactNode
  className?: string
  trailing?: ReactNode
}

export function FieldWrap({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  trailing,
}: FieldWrapProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-fg-muted">
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fg-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Rendered on the label row, right-aligned. */
  trailing?: ReactNode
  /** Rendered inside the control, vertically centred at the right edge (e.g. an icon button). */
  inset?: ReactNode
  wrapClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, trailing, inset, wrapClassName, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = `${inputId}-hint`
  const input = (
    <input
      ref={ref}
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={hint || error ? hintId : undefined}
      className={cn(control, inset ? 'pr-12' : undefined, className)}
      {...rest}
    />
  )
  return (
    <FieldWrap
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={wrapClassName}
      trailing={trailing}
    >
      {inset ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-1.5 flex items-center">{inset}</div>
        </div>
      ) : (
        input
      )}
      <span id={hintId} className="sr-only">
        {error ?? hint}
      </span>
    </FieldWrap>
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  trailing?: ReactNode
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, trailing, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={inputId} trailing={trailing}>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'min-h-24 resize-y', className)}
        {...rest}
      />
    </FieldWrap>
  )
})

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <FieldWrap label={label} hint={hint} error={error} htmlFor={inputId}>
      <select
        ref={ref}
        id={inputId}
        className={cn(control, 'appearance-none', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  )
})

interface ToggleProps {
  id?: string
  label: ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  testId?: string
}

export function Toggle({ id, label, checked, onChange, disabled, testId }: ToggleProps) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer items-center justify-between gap-4 py-2"
    >
      <span className="text-base">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          data-testid={testId}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="h-7 w-12 rounded-full bg-bg-elev-2 transition-colors peer-checked:bg-teal peer-focus-visible:ring-4 peer-focus-visible:ring-amber peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="absolute top-1 left-1 size-5 rounded-full bg-fg transition-transform peer-checked:translate-x-5 peer-checked:bg-fg-on-accent"
        />
      </span>
    </label>
  )
}
