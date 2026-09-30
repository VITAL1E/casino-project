// Slither Royale is server-authoritative: this module only opens the
// WebSocket, sends steering inputs / join / leave, and hands back whatever the
// server broadcasts. Nothing here simulates the game or computes a payout.
//
// Auth is the httpOnly session cookie, which the browser attaches to the
// socket upgrade itself; the server refuses the upgrade if it is missing.
import { API_BASE, ApiError } from '../../lib/apiClient'
import { getWallet, resetWallet } from '../../lib/walletApi'
import type { ClientMsg, ServerMsg } from './protocol'

export { ApiError, getWallet, resetWallet }

export type SlitherSocket = { send: (msg: ClientMsg) => void; close: () => void }

export const openSocket = (onMessage: (msg: ServerMsg) => void, onClose: () => void): SlitherSocket => {
  const ws = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/ws/slither`)
  ws.onmessage = e => {
    try { onMessage(JSON.parse(String(e.data)) as ServerMsg) } catch { /* ignore malformed frames */ }
  }
  ws.onclose = onClose
  return {
    send: msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) },
    close: () => { ws.onclose = null; ws.close() },
  }
}
