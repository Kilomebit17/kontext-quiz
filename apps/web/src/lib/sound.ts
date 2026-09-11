/**
 * Synthesized sound cues via the Web Audio API — no audio files.
 * The AudioContext is created lazily on the first user gesture.
 */

export type SoundName =
  'questionStart' | 'tick' | 'correct' | 'incorrect' | 'fanfare' | 'join' | 'countdown'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let unlocked = false

type AudioContextCtor = typeof AudioContext
function getCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = getCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.35
    master.connect(ctx.destination)
  } catch {
    ctx = null
  }
  return ctx
}

/** Call from a user gesture to unlock audio on iOS/Safari. */
export function unlockAudio(): void {
  if (unlocked) return
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  unlocked = true
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
}

export function isSoundEnabled(): boolean {
  return enabled
}

if (typeof window !== 'undefined') {
  const handler = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('keydown', handler)
  }
  window.addEventListener('pointerdown', handler, { passive: true })
  window.addEventListener('keydown', handler)
}

interface Tone {
  freq: number
  /** Start offset in seconds relative to "now". */
  at: number
  dur: number
  type?: OscillatorType
  gain?: number
}

function playTones(tones: Tone[]): void {
  if (!enabled) return
  const c = ensureContext()
  if (!c || !master) return
  if (c.state === 'suspended') void c.resume()
  const now = c.currentTime
  for (const tone of tones) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.setValueAtTime(tone.freq, now + tone.at)
    const peak = tone.gain ?? 0.8
    g.gain.setValueAtTime(0.0001, now + tone.at)
    g.gain.exponentialRampToValueAtTime(peak, now + tone.at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.dur)
    osc.connect(g)
    g.connect(master)
    osc.start(now + tone.at)
    osc.stop(now + tone.at + tone.dur + 0.02)
  }
}

const cues: Record<SoundName, () => void> = {
  questionStart: () =>
    playTones([
      { freq: 523.25, at: 0, dur: 0.14, type: 'triangle' },
      { freq: 783.99, at: 0.14, dur: 0.24, type: 'triangle' },
    ]),
  tick: () => playTones([{ freq: 1200, at: 0, dur: 0.06, type: 'square', gain: 0.25 }]),
  countdown: () => playTones([{ freq: 880, at: 0, dur: 0.12, type: 'triangle', gain: 0.5 }]),
  correct: () =>
    playTones([
      { freq: 523.25, at: 0, dur: 0.14, type: 'triangle' },
      { freq: 659.25, at: 0.1, dur: 0.14, type: 'triangle' },
      { freq: 783.99, at: 0.2, dur: 0.14, type: 'triangle' },
      { freq: 1046.5, at: 0.3, dur: 0.32, type: 'triangle' },
    ]),
  incorrect: () =>
    playTones([
      { freq: 160, at: 0, dur: 0.28, type: 'sawtooth', gain: 0.5 },
      { freq: 120, at: 0.05, dur: 0.32, type: 'square', gain: 0.25 },
    ]),
  fanfare: () =>
    playTones([
      { freq: 392, at: 0, dur: 0.16, type: 'triangle' },
      { freq: 523.25, at: 0.16, dur: 0.16, type: 'triangle' },
      { freq: 659.25, at: 0.32, dur: 0.16, type: 'triangle' },
      { freq: 783.99, at: 0.48, dur: 0.3, type: 'triangle' },
      { freq: 659.25, at: 0.8, dur: 0.12, type: 'triangle' },
      { freq: 783.99, at: 0.92, dur: 0.6, type: 'triangle' },
      { freq: 1046.5, at: 0.92, dur: 0.6, type: 'sine', gain: 0.5 },
    ]),
  join: () =>
    playTones([
      { freq: 660, at: 0, dur: 0.08, type: 'sine', gain: 0.5 },
      { freq: 990, at: 0.06, dur: 0.12, type: 'sine', gain: 0.4 },
    ]),
}

export function playSound(name: SoundName): void {
  try {
    cues[name]()
  } catch {
    // audio is best-effort
  }
}

export const sound = {
  play: playSound,
  unlock: unlockAudio,
  setEnabled: setSoundEnabled,
  isEnabled: isSoundEnabled,
}
