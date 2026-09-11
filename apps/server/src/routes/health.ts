import type { FastifyInstance } from 'fastify'
import type { RoomManager } from '../game/manager.js'
import type { IoServer } from '../game/socket.js'

export async function healthRoutes(
  app: FastifyInstance,
  opts: { manager: RoomManager; io: IoServer; instanceId: string },
): Promise<void> {
  const { manager, io, instanceId } = opts

  app.get('/healthz', async () => ({ ok: true, instanceId, uptime: Math.round(process.uptime()) }))

  app.get('/metrics', async (request, reply) => {
    let activeRooms = 0
    for (const r of manager.all()) if (r.status !== 'ended') activeRooms++
    const metrics = {
      activeRooms,
      activePlayers: manager.activePlayers,
      connections: io.engine.clientsCount,
      instanceId,
    }
    const accept = request.headers.accept ?? ''
    if (accept.includes('text/plain') && !accept.includes('application/json')) {
      const mem = process.memoryUsage()
      const lines = [
        '# HELP kq_active_rooms Rooms that have not ended on this instance.',
        '# TYPE kq_active_rooms gauge',
        `kq_active_rooms{instance="${instanceId}"} ${metrics.activeRooms}`,
        '# HELP kq_active_players Connected players in active rooms.',
        '# TYPE kq_active_players gauge',
        `kq_active_players{instance="${instanceId}"} ${metrics.activePlayers}`,
        '# HELP kq_socket_connections Open Socket.IO connections.',
        '# TYPE kq_socket_connections gauge',
        `kq_socket_connections{instance="${instanceId}"} ${metrics.connections}`,
        '# HELP process_resident_memory_bytes Resident memory size in bytes.',
        '# TYPE process_resident_memory_bytes gauge',
        `process_resident_memory_bytes{instance="${instanceId}"} ${mem.rss}`,
        '# HELP process_uptime_seconds Process uptime.',
        '# TYPE process_uptime_seconds gauge',
        `process_uptime_seconds{instance="${instanceId}"} ${Math.round(process.uptime())}`,
      ]
      return reply
        .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(lines.join('\n') + '\n')
    }
    return metrics
  })
}
