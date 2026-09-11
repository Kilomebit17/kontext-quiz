import { create } from 'zustand'
import type { User } from '@kontext/shared'
import { api, ApiError } from '@/lib/api'

interface AuthState {
  user: User | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  loadMe: () => Promise<User | null>
  /** Nickname + password; creates the account when the nickname is free. */
  loginWithPassword: (
    nickname: string,
    password: string,
  ) => Promise<{ user: User; created: boolean }>
  logout: () => Promise<void>
  /** Pick a different avatar character (any id from the catalogue). */
  updateAvatar: (avatar: string) => Promise<User>
}

let inflight: Promise<User | null> | null = null

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'idle',
  loadMe: async () => {
    if (inflight) return inflight
    set({ status: 'loading' })
    inflight = api.auth
      .me()
      .then((r) => {
        set({ user: r.user, status: 'ready' })
        return r.user
      })
      .catch((err: unknown) => {
        // A missing server or 401 simply means "guest".
        set({ user: null, status: err instanceof ApiError && err.status === 0 ? 'error' : 'ready' })
        return null
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  },
  loginWithPassword: async (nickname, password) => {
    const r = await api.auth.password(nickname, password)
    set({ user: r.user, status: 'ready' })
    return r
  },
  logout: async () => {
    try {
      await api.auth.logout()
    } finally {
      set({ user: null, status: 'ready' })
    }
  },
  updateAvatar: async (avatar) => {
    const r = await api.auth.updateAvatar(avatar)
    set({ user: r.user })
    return r.user
  },
}))
