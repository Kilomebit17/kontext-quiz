import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface SessionClaims {
  sub: string
}
export interface HostClaims {
  sessionId: string
  role: 'host'
}
export interface PlayerClaims {
  sessionId: string
  playerId: string
  role: 'player'
}
export interface AttemptClaims {
  challengeId: string
  attemptId: string
  role: 'attempt'
}

export const SESSION_TTL_SEC = 30 * 24 * 3600
const GAME_TTL_SEC = 24 * 3600

export class Jwt {
  private readonly key: Uint8Array

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret)
  }

  private async sign(payload: JWTPayload, ttlSec: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
      .sign(this.key)
  }

  private async verify(token: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] })
      return payload
    } catch {
      return null
    }
  }

  signSession(userId: string) {
    return this.sign({ sub: userId }, SESSION_TTL_SEC)
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    const p = await this.verify(token)
    if (!p || typeof p.sub !== 'string' || p.role) return null
    return { sub: p.sub }
  }

  signHost(sessionId: string) {
    return this.sign({ sessionId, role: 'host' }, GAME_TTL_SEC)
  }

  async verifyHost(token: string): Promise<HostClaims | null> {
    const p = await this.verify(token)
    if (!p || p.role !== 'host' || typeof p.sessionId !== 'string') return null
    return { sessionId: p.sessionId, role: 'host' }
  }

  signPlayer(sessionId: string, playerId: string) {
    return this.sign({ sessionId, playerId, role: 'player' }, GAME_TTL_SEC)
  }

  async verifyPlayer(token: string): Promise<PlayerClaims | null> {
    const p = await this.verify(token)
    if (
      !p ||
      p.role !== 'player' ||
      typeof p.sessionId !== 'string' ||
      typeof p.playerId !== 'string'
    )
      return null
    return { sessionId: p.sessionId, playerId: p.playerId, role: 'player' }
  }

  signAttempt(challengeId: string, attemptId: string) {
    return this.sign({ challengeId, attemptId, role: 'attempt' }, 7 * 24 * 3600)
  }

  async verifyAttempt(token: string): Promise<AttemptClaims | null> {
    const p = await this.verify(token)
    if (
      !p ||
      p.role !== 'attempt' ||
      typeof p.challengeId !== 'string' ||
      typeof p.attemptId !== 'string'
    )
      return null
    return { challengeId: p.challengeId, attemptId: p.attemptId, role: 'attempt' }
  }
}
