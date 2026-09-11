const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Short random id (client-side option / question ids, local quiz ids). */
export function newId(prefix = '', length = 10): string {
  let out = prefix
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length)
    cryptoObj.getRandomValues(bytes)
    for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
    return out
  }
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

export const LOCAL_ID_PREFIX = 'local_'
export const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX)
