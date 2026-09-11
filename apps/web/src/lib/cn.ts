export type ClassValue = string | false | null | undefined

/** Tiny class-name joiner. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
