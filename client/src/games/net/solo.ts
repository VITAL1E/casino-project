// WebSocket client for the single-player, server-authoritative arcade games (Flappy, Road Cross).
import { WS_BASE } from '../../lib/apiClient'
import type { SoloClientMsg, SoloServerMsg } from './soloProtocol'

export type * from './soloProtocol'

export type SoloSocket = { send: (msg: SoloClientMsg) => void; close: () => void }

export const openSoloSocket = (game: string, onMessage: (msg: SoloServerMsg) => void, onClose: () => void): SoloSocket => {
  const ws = new WebSocket(`${WS_BASE}/ws/${game}`)
  ws.onmessage = e => {
    try { onMessage(JSON.parse(String(e.data)) as SoloServerMsg) } catch { /* ignore malformed frames */ }
  }
  ws.onclose = onClose
  return {
    send: msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) },
    close: () => { ws.onclose = null; ws.close() },
  }
}
