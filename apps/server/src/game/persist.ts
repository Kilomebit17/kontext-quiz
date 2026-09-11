import type { GameResult } from '@kontext/shared'
import type { Store } from '../store/types.js'
import type { GameRoom } from './room.js'

/** Archive an ended room exactly once. Safe to call repeatedly. */
export async function persistRoomResult(store: Store, room: GameRoom): Promise<GameResult> {
  const result = room.buildResult()
  await store.gameResults.save(result)
  await store.gameSessions.update(room.sessionId, {
    status: 'ended',
    startedAt: room.startedAt ? new Date(room.startedAt) : null,
    endedAt: new Date(result.endedAt),
  })
  return result
}
