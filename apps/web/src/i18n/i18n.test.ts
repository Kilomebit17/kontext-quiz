import { describe, expect, it } from 'vitest'
import uk from './uk.json'
import en from './en.json'

type Tree = { [key: string]: string | Tree }

function flattenKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [path] : flattenKeys(value, path)
  })
}

describe('i18n resources', () => {
  const ukKeys = flattenKeys(uk as Tree).sort()
  const enKeys = flattenKeys(en as Tree).sort()

  it('uk and en have identical key sets', () => {
    const missingInEn = ukKeys.filter((k) => !enKeys.includes(k))
    const missingInUk = enKeys.filter((k) => !ukKeys.includes(k))
    expect(missingInEn, 'keys missing in en.json').toEqual([])
    expect(missingInUk, 'keys missing in uk.json').toEqual([])
    expect(ukKeys).toEqual(enKeys)
  })

  it('has no empty strings', () => {
    const empty = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'string' ? (v.trim() ? [] : [`${prefix}${k}`]) : empty(v, `${prefix}${k}.`),
      )
    expect(empty(uk as Tree)).toEqual([])
    expect(empty(en as Tree)).toEqual([])
  })

  it('interpolation placeholders match between locales', () => {
    const placeholders = (s: string) =>
      (s.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort()
    const get = (tree: Tree, path: string) =>
      path
        .split('.')
        .reduce<string | Tree>((acc, k) => (typeof acc === 'string' ? acc : acc[k]!), tree)
    for (const key of ukKeys) {
      const a = get(uk as Tree, key)
      const b = get(en as Tree, key)
      if (typeof a === 'string' && typeof b === 'string') {
        expect(placeholders(a), key).toEqual(placeholders(b))
      }
    }
  })
})
