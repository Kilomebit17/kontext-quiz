/** Dynamically loaded confetti so the player bundle stays small. */
export async function fireConfetti(kind: 'burst' | 'podium' = 'burst'): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const { default: confetti } = await import('canvas-confetti')
  const colors = ['#FF6B6B', '#2EC4B6', '#FFB627', '#7C6FF0', '#F4F6FF']
  if (kind === 'burst') {
    void confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors })
    return
  }
  const end = Date.now() + 2500
  const frame = () => {
    void confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors })
    void confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}
