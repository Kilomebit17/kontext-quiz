import type { SVGProps } from 'react'

export function Rhombus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" fill="currentColor" />
    </svg>
  )
}
