import { create } from 'zustand'
import type { Quiz, QuizInput, QuizSummary } from '@kontext/shared'
import { apiRepo, localRepo, repoFor, toInput, type QuizRepo } from '@/lib/quizRepo'
import { useAuthStore } from './authStore'

interface QuizState {
  quizzes: QuizSummary[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  repo: () => QuizRepo
  load: () => Promise<void>
  get: (id: string) => Promise<Quiz | null>
  create: (input: QuizInput) => Promise<Quiz>
  update: (id: string, input: QuizInput) => Promise<Quiz>
  remove: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<Quiz>
  /** Number of guest quizzes still in localStorage. */
  localCount: () => number
  /** Upload every local quiz to the account, then clear localStorage. */
  importLocalToAccount: () => Promise<number>
}

export const useQuizStore = create<QuizState>()((set, get) => ({
  quizzes: [],
  status: 'idle',
  error: null,

  repo: () => (useAuthStore.getState().user ? apiRepo : localRepo),

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const quizzes = await get().repo().list()
      set({ quizzes, status: 'ready' })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  get: (id) => repoFor(id, Boolean(useAuthStore.getState().user)).get(id),

  create: async (input) => {
    const quiz = await get().repo().create(input)
    await get().load()
    return quiz
  },

  update: async (id, input) => {
    const quiz = await repoFor(id, Boolean(useAuthStore.getState().user)).update(id, input)
    await get().load()
    return quiz
  },

  remove: async (id) => {
    await repoFor(id, Boolean(useAuthStore.getState().user)).remove(id)
    set({ quizzes: get().quizzes.filter((q) => q.id !== id) })
  },

  duplicate: async (id) => {
    const quiz = await repoFor(id, Boolean(useAuthStore.getState().user)).duplicate(id)
    await get().load()
    return quiz
  },

  localCount: () => localRepo.readAll().length,

  importLocalToAccount: async () => {
    if (!useAuthStore.getState().user) return 0
    const local = localRepo.readAll()
    let n = 0
    for (const quiz of local) {
      await apiRepo.create(toInput(quiz))
      n++
    }
    localRepo.clear()
    await get().load()
    return n
  },
}))
