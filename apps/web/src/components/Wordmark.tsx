import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Render as a link to `/` (default) or a plain span. */
  link?: boolean
  /** Hide the text and show only the mark (tight spaces). */
  iconOnly?: boolean
}

const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl sm:text-5xl' }
const marks = { sm: 'size-7', md: 'size-9', lg: 'size-14 sm:size-16' }

/** The leaf-and-cross symbol from the Kontext logo (public/icons/kontext-icon.svg, 172×238). */
const LEAF_ICON_URL = '/icons/kontext-icon.svg'

/**
 * The leaf-and-cross symbol as an inline glyph. The source artwork is white on
 * transparent, so it is applied as a CSS mask over `currentColor` and follows
 * the surrounding text colour.
 */
export function LeafCross({ className }: { className?: string }) {
  const mask = `url(${LEAF_ICON_URL})`
  return (
    <span
      className={cn('inline-block bg-current', className)}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
      aria-hidden="true"
    />
  )
}

/**
 * The tile with the four answer shapes — wave, spark, ring, rhombus — in the
 * four accent colours; leads the wordmark.
 */
export function ShapesMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#1C2447" />
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="none"
        stroke="#2EC4B6"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      <path
        d="M9 21c3-4 6-4 9 0s6 4 9 0"
        fill="none"
        stroke="#FF6B6B"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M46 10l2.6 7.4L56 20l-7.4 2.6L46 30l-2.6-7.4L36 20l7.4-2.6z" fill="#2EC4B6" />
      <circle cx="18" cy="46" r="7.5" fill="none" stroke="#FFB627" strokeWidth="4.5" />
      <path d="M46 36l9 10-9 10-9-10z" fill="#7C6FF0" />
    </svg>
  )
}

/** Square app icon: the four-shapes tile, same as the favicon / PWA icon. */
export function LogoMark({ className }: { className?: string }) {
  return <ShapesMark className={className} />
}

/** "KONTEXT QUIZ" wordmark; the "O" is the leaf-and-cross symbol from the logo. */
export function Wordmark({ size = 'md', className, link = true, iconOnly = false }: WordmarkProps) {
  const { t } = useTranslation()
  const content = iconOnly ? (
    <LogoMark className={cn(marks[size], className)} />
  ) : (
    <span
      className={cn(
        'font-heading inline-flex items-center gap-[0.45em] leading-none whitespace-nowrap uppercase',
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      <ShapesMark className={cn('shrink-0', marks[size])} />
      <span className="inline-flex items-baseline gap-[0.3em]">
        <span className="inline-flex items-baseline font-extrabold tracking-[0.04em] text-fg">
          K
          <LeafCross className="mx-[0.06em] h-[1.04em] w-[0.76em] translate-y-[0.14em] text-fg" />
          NTEXT
        </span>
        <span className="hidden font-light tracking-[0.12em] text-coral sm:inline">Quiz</span>
      </span>
    </span>
  )
  if (!link) return content
  return (
    <Link to="/" aria-label={t('a11y.wordmark')} className="inline-flex rounded-lg">
      {content}
    </Link>
  )
}
