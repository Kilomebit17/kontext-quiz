import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, text, kind }] })
    setTimeout(() => get().dismiss(id), kind === 'error' ? 5000 : 3000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = {
  info: (text: string) => useToastStore.getState().push(text, 'info'),
  success: (text: string) => useToastStore.getState().push(text, 'success'),
  error: (text: string) => useToastStore.getState().push(text, 'error'),
}
