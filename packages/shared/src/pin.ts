/** Generate a random 6-digit PIN (never starting with 0 for readability). */
export function generatePin(random: () => number = Math.random): string {
  const first = 1 + Math.floor(random() * 9)
  let rest = ''
  for (let i = 0; i < 5; i++) rest += Math.floor(random() * 10)
  return `${first}${rest}`
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/** Format "123456" → "123 456" for display. */
export function formatPin(pin: string): string {
  return pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin
}

/** Short URL-safe code for challenge links. */
export function generateCode(length = 8, random: () => number = Math.random): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(random() * alphabet.length)]
  return out
}
