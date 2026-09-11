import type { LeaderboardEntry } from '@kontext/shared'

export interface ResultRow {
  id: string
  rank: number
  nickname: string
  avatar?: string | null
  score: number
  correct: number | null
}

export function fromRanking(entries: LeaderboardEntry[]): ResultRow[] {
  return entries.map((e) => ({
    id: e.playerId,
    rank: e.rank,
    nickname: e.nickname,
    avatar: e.avatar,
    score: e.score,
    correct: null,
  }))
}
