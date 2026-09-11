import { describe, expect, it } from 'vitest'
import { dedupeNickname, sanitizeNickname, validateNickname } from '../src/nickname'
import { containsProfanity } from '../src/profanity'
import { formatPin, generateCode, generatePin, isValidPin } from '../src/pin'
import { seededRandom, shuffle } from '../src/shuffle'

describe('profanity', () => {
  it('detects plain and obfuscated words', () => {
    expect(containsProfanity('fuck')).toBe(true)
    expect(containsProfanity('F.u.c.k')).toBe(true)
    expect(containsProfanity('sh1t')).toBe(true)
    expect(containsProfanity('Пиздець')).toBe(true)
    expect(containsProfanity('блять123')).toBe(true)
  })
  it('lets normal names through', () => {
    expect(containsProfanity('Олена')).toBe(false)
    expect(containsProfanity('Marta')).toBe(false)
    expect(containsProfanity('Хермес')).toBe(true) // contains "хер" — accepted tradeoff
    expect(containsProfanity('Sasha')).toBe(false)
  })
})

describe('nickname', () => {
  it('sanitizes whitespace and control chars', () => {
    expect(sanitizeNickname('  Bob​   Smith\n')).toBe('Bob Smith')
  })
  it('validates', () => {
    expect(validateNickname('Олена')).toEqual({ ok: true, nickname: 'Олена' })
    expect(validateNickname('')).toEqual({ ok: false, error: 'NICKNAME_INVALID' })
    expect(validateNickname('<script>')).toEqual({ ok: false, error: 'NICKNAME_INVALID' })
    expect(validateNickname('fuck')).toEqual({ ok: false, error: 'NICKNAME_PROFANE' })
  })
  it('dedupes with suffixes', () => {
    expect(dedupeNickname('Bob', ['alice'])).toBe('Bob')
    expect(dedupeNickname('Bob', ['bob'])).toBe('Bob 2')
    expect(dedupeNickname('Bob', ['bob', 'Bob 2'])).toBe('Bob 3')
    const long = 'A'.repeat(20)
    const d = dedupeNickname(long, [long])
    expect(d.length).toBeLessThanOrEqual(20)
    expect(d.endsWith(' 2')).toBe(true)
  })
})

describe('pin', () => {
  it('generates 6 digits not starting with 0', () => {
    for (let i = 0; i < 100; i++) {
      const p = generatePin()
      expect(isValidPin(p)).toBe(true)
      expect(p[0]).not.toBe('0')
    }
  })
  it('formats', () => {
    expect(formatPin('123456')).toBe('123 456')
  })
  it('generates codes', () => {
    expect(generateCode(8)).toHaveLength(8)
  })
})

describe('shuffle', () => {
  it('is deterministic with a seed and preserves elements', () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRandom(42))
    const b = shuffle([1, 2, 3, 4, 5], seededRandom(42))
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
