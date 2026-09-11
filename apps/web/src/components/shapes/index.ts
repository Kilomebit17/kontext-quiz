import type { ComponentType, SVGProps } from 'react'
import { Wave } from './Wave'
import { Spark } from './Spark'
import { Ring } from './Ring'
import { Rhombus } from './Rhombus'

export type ShapeName = 'wave' | 'spark' | 'ring' | 'rhombus'

export interface ShapeDef {
  name: ShapeName
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Tailwind background class. */
  bg: string
  /** Tailwind text color class for the shape on dark backgrounds. */
  text: string
  /** Text color for content placed on the accent background (AA contrast). */
  onBg: string
  /** Raw CSS color. */
  color: string
}

/** Option index 0..3 → color + shape. Never rely on color alone. */
export const SHAPES: readonly ShapeDef[] = [
  {
    name: 'wave',
    Icon: Wave,
    bg: 'bg-coral',
    text: 'text-coral',
    onBg: 'text-fg-on-accent',
    color: '#FF6B6B',
  },
  {
    name: 'spark',
    Icon: Spark,
    bg: 'bg-teal',
    text: 'text-teal',
    onBg: 'text-fg-on-accent',
    color: '#2EC4B6',
  },
  {
    name: 'ring',
    Icon: Ring,
    bg: 'bg-amber',
    text: 'text-amber',
    onBg: 'text-fg-on-accent',
    color: '#FFB627',
  },
  {
    name: 'rhombus',
    Icon: Rhombus,
    bg: 'bg-violet',
    text: 'text-violet',
    onBg: 'text-fg',
    color: '#7C6FF0',
  },
]

export function shapeFor(index: number): ShapeDef {
  return SHAPES[((index % 4) + 4) % 4] as ShapeDef
}
