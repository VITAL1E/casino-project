// Generic WebSocket client for the server-authoritative arcade games. It only
// opens the socket, sends inputs / join / leave and hands back what the server
// broadcasts; nothing here simulates a game or computes a payout.
//
// Auth is the httpOnly session cookie, which the browser attaches to the upgrade
// itself; the server refuses the upgrade if it is missing.
import { WS_BASE } from '../../lib/apiClient'
import type { NetClientMsg, NetServerMsg } from './protocol'

export type NetSocket = { send: (msg: NetClientMsg) => void; close: () => void }

export const openNetSocket = (game: string, onMessage: (msg: NetServerMsg) => void, onClose: () => void): NetSocket => {
  const ws = new WebSocket(`${WS_BASE}/ws/${game}`)
  ws.onmessage = e => {
    try { onMessage(JSON.parse(String(e.data)) as NetServerMsg) } catch { /* ignore malformed frames */ }
  }
  ws.onclose = onClose
  return {
    send: msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) },
    close: () => { ws.onclose = null; ws.close() },
  }
}
