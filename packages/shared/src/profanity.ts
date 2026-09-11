/**
 * Small profanity list (uk / ru / en). Matching is done on a normalized string
 * with common leet substitutions and repeated characters collapsed.
 * Deliberately conservative: better to let an edge case through than to block
 * ordinary nicknames.
 */
const WORDS = [
  // English
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'dick',
  'pussy',
  'nigger',
  'nigga',
  'faggot',
  'whore',
  'slut',
  'retard',
  // Ukrainian / Russian
  'хуй',
  'хуя',
  'хуе',
  'хуі',
  'пизд',
  'підар',
  'пидар',
  'підор',
  'пидор',
  'блять',
  'блядь',
  'бляд',
  'ебат',
  'ебан',
  'їбат',
  'йобан',
  'йоба',
  'єбат',
  'сука',
  'сучка',
  'мудак',
  'мудил',
  'гандон',
  'гондон',
  'залуп',
  'манда',
  'шлюха',
  'курва',
  'хер',
  'хєр',
]

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
}

export function normalizeForProfanity(input: string): string {
  const lowered = input.normalize('NFKC').toLowerCase()
  let out = ''
  for (const ch of lowered) {
    const mapped = LEET[ch] ?? ch
    if (/[\p{L}\p{N}]/u.test(mapped)) out += mapped
  }
  // collapse repeated characters: "fuuuck" -> "fuck"
  return out.replace(/(.)\1+/g, '$1')
}

export function containsProfanity(input: string): boolean {
  const n = normalizeForProfanity(input)
  if (!n) return false
  return WORDS.some((w) => n.includes(normalizeForProfanity(w)))
}
