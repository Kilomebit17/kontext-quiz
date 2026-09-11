import type { SVGProps } from 'react'

export function Spark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 2c.6 4.4 2.6 7.4 8 8-5.4.6-7.4 2.6-8 8-.6-5.4-2.6-7.4-8-8 5.4-.6 7.4-3.6 8-8z"
        fill="currentColor"
      />
    </svg>
  )
}
