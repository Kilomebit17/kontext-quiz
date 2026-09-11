import { AVATAR_CHARACTERS } from './avatar-catalog'

export { AVATAR_CHARACTERS, AVATAR_IMAGE_EXT } from './avatar-catalog'

/**
 * Avatars: a random character on a random accent background, assigned once
 * (account creation / game join) and never changed by the user.
 * Serialized as `${character}-${color}`, e.g. "fox-2".
 *
 * The character list lives in ./avatar-catalog (generated from image files).
 */
export const AVATAR_ANIMALS = AVATAR_CHARACTERS
export type AvatarAnimal = (typeof AVATAR_ANIMALS)[number]

/** Background colours (indices are stable — never reorder). */
export const AVATAR_COLORS = [
  '#FF6B6B', // coral
  '#2EC4B6', // teal
  '#FFB627', // amber
  '#7C6FF0', // violet
  '#4CC9F0', // sky
  '#F7A1C4', // pink
  '#8AC926', // lime
  '#FF8C42', // orange
] as const

export type AvatarId = `${AvatarAnimal}-${number}`

export interface AvatarParts {
  animal: AvatarAnimal
  color: string
  colorIndex: number
}

export function randomAvatar(random: () => number = Math.random): AvatarId {
  const animal = AVATAR_ANIMALS[Math.floor(random() * AVATAR_ANIMALS.length)] ?? AVATAR_ANIMALS[0]
  const color = Math.floor(random() * AVATAR_COLORS.length)
  return `${animal}-${color}`
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && parseAvatar(value) !== null
}

export function parseAvatar(id: string | null | undefined): AvatarParts | null {
  if (!id) return null
  const i = id.lastIndexOf('-')
  if (i <= 0) return null
  const animal = id.slice(0, i) as AvatarAnimal
  const colorIndex = Number(id.slice(i + 1))
  if (!(AVATAR_ANIMALS as readonly string[]).includes(animal)) return null
  if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= AVATAR_COLORS.length)
    return null
  return { animal, colorIndex, color: AVATAR_COLORS[colorIndex] ?? AVATAR_COLORS[0] }
}
