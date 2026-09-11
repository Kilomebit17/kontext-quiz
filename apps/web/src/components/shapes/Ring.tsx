import type { SVGProps } from 'react'

export function Ring(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  )
}
