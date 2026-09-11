/** Extract a YouTube video id from watch/short/embed/youtu.be URLs. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const valid = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null)
  if (host === 'youtu.be') return valid(u.pathname.slice(1).split('/')[0])
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return valid(u.searchParams.get('v'))
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)
    if (m) return valid(m[1])
  }
  return null
}

export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`
}

export type MediaKind = 'youtube' | 'image' | 'none'

export function detectMedia(url: string | null | undefined): { kind: MediaKind; id?: string } {
  if (!url) return { kind: 'none' }
  const id = parseYouTubeId(url)
  if (id) return { kind: 'youtube', id }
  return /^https?:\/\//i.test(url) ? { kind: 'image' } : { kind: 'none' }
}
