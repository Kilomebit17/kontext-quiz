import { create } from 'zustand'

interface AnnouncerState {
  message: string
  /** Increments so identical messages are re-announced. */
  seq: number
  announce: (message: string) => void
}

/** Backs the single global `aria-live="polite"` region. */
export const useAnnouncer = create<AnnouncerState>()((set, get) => ({
  message: '',
  seq: 0,
  announce: (message) => set({ message, seq: get().seq + 1 }),
}))

export const announce = (message: string) => useAnnouncer.getState().announce(message)
