import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/** scrypt parameters (N, r, p); ~50 ms on a laptop core. */
const N = 16384
const R = 8
const P = 1
const KEY_LEN = 64

function derive(password: string, salt: Buffer, keyLen: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLen, { N: n, r, p }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })
}

/** Returns `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, KEY_LEN, N, R, P)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$')
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const key = await derive(
    password,
    Buffer.from(saltB64, 'base64'),
    expected.length,
    Number(n),
    Number(r),
    Number(p),
  )
  return key.length === expected.length && timingSafeEqual(key, expected)
}
