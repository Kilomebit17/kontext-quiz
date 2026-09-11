/** Safe JSON storage helpers (private mode / quota errors are swallowed). */

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function safe(store: () => Store): Store | null {
  try {
    return store()
  } catch {
    return null
  }
}

export function readJson<T>(store: 'local' | 'session', key: string): T | null {
  const s = safe(() => (store === 'local' ? window.localStorage : window.sessionStorage))
  if (!s) return null
  try {
    const raw = s.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(store: 'local' | 'session', key: string, value: unknown): void {
  const s = safe(() => (store === 'local' ? window.localStorage : window.sessionStorage))
  if (!s) return
  try {
    s.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / privacy errors
  }
}

export function removeKey(store: 'local' | 'session', key: string): void {
  const s = safe(() => (store === 'local' ? window.localStorage : window.sessionStorage))
  if (!s) return
  try {
    s.removeItem(key)
  } catch {
    // ignore
  }
}

export const PLAYER_SESSION_KEY = 'kq.player'
export const hostSessionKey = (sessionId: string) => `kq.host.${sessionId}`
export const QUIZZES_KEY = 'kq.quizzes'
export const editorDraftKey = (id: string) => `kq.draft.${id}`
export const SOUND_KEY = 'kq.sound'

export interface StoredPlayerSession {
  token: string
  sessionId: string
  nickname: string
}
