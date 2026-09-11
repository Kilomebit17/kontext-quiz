import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal' | 'coral'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  block?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-amber text-fg-on-accent hover:brightness-110 active:brightness-95 shadow-[0_8px_24px_rgb(255_182_39/0.25)]',
  secondary: 'bg-bg-elev-2 text-fg hover:bg-[#2b3668] border border-line',
  ghost: 'bg-transparent text-fg hover:bg-fg/10',
  danger: 'bg-error text-fg-on-accent hover:brightness-110',
  teal: 'bg-teal text-fg-on-accent hover:brightness-110',
  coral: 'bg-coral text-fg-on-accent hover:brightness-110',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-base rounded-xl gap-2',
  lg: 'h-14 px-6 text-lg rounded-2xl gap-2 font-semibold',
  xl: 'h-16 px-8 text-xl rounded-2xl gap-3 font-heading font-bold',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    block = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-[filter,background-color,transform] duration-150 select-none',
        'focus-visible:ring-4 focus-visible:ring-amber focus-visible:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
})
