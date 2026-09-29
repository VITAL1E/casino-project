// Real-money (well, real-coins) win events, pushed to every connected
// browser over Server-Sent Events. One-directional (server -> client), so
// SSE over plain HTTP — no WebSocket upgrade/connection-state bookkeeping
// needed for a feed nobody talks back on.
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Request, Response } from 'express'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(HERE, 'data')
const FILE = path.join(DATA_DIR, 'live-wins.json')

export type WinEvent = {
  id: string
  gameId: string | null   // matches an id in client/src/data/casino.ts GAMES, or null (no thumbnail)
  label: string           // display name, e.g. 'Slither Royale' or 'Man City vs Arsenal'
  username: string
  amount: number
  at: string
}

const clients = new Set<Response>()
const HISTORY_SIZE = 20

// Persisted to disk (server/data/live-wins.json — same gitignored spot the
// old JSON wallet store used) so a server restart doesn't wipe the feed
// back to empty; it reloads whatever was there last time instead.
const loadHistory = (): WinEvent[] => {
  if (!existsSync(FILE)) return []
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const history: WinEvent[] = loadHistory()

const persist = () => {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(history))
  } catch {
    // best-effort — an unwritable disk shouldn't take the feed down
  }
}

const write = (res: Response, event: WinEvent) => {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export const broadcastWin = (event: WinEvent) => {
  history.unshift(event)
  history.length = Math.min(history.length, HISTORY_SIZE)
  persist()
  for (const res of clients) write(res, event)
}

// GET /api/events/wins — public, read-only, no session needed (nothing
// here is sensitive: a display name, a game, and an amount).
export const streamWins = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  for (const event of [...history].reverse()) write(res, event)

  clients.add(res)
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    clearInterval(keepAlive)
    clients.delete(res)
  })
}

// Demo filler — real slither/sports payouts are rare on a freshly-started
// dev server, and an empty feed looks broken rather than quiet. Pushes
// synthetic wins through the exact same broadcastWin() path so the UI
// code stays real; disable with DEMO_LIVE_WINS=false once there's enough
// real traffic that this isn't needed (or before this ever goes live).
const DEMO_GAMES: { gameId: string | null; label: string }[] = [
  { gameId: 'o10', label: 'Slither Royale' },
  { gameId: 'o12', label: 'Chicken Royale' },
  { gameId: 'o11', label: 'Agar Royale' },
  { gameId: 'o15', label: 'Road Cross' },
  { gameId: 'o16', label: 'Flappy Cash' },
  { gameId: 'o17', label: 'Storm Royale' },
  { gameId: 'o1', label: 'Dice' },
  { gameId: null, label: 'Arsenal vs Chelsea' },
]
const DEMO_NAMES = ['Player_2481', 'Player_9017', 'Player_5563', 'Player_3390', 'Player_7742', 'Player_1205', 'Player_8834']

const randomDemoWin = (): WinEvent => {
  const game = DEMO_GAMES[Math.floor(Math.random() * DEMO_GAMES.length)]
  // skewed toward small wins, with the occasional big one
  const amount = Math.round(Math.exp(Math.log(5) + Math.random() * (Math.log(5000) - Math.log(5))) * 100) / 100
  return {
    id: randomUUID(),
    gameId: game.gameId,
    label: game.label,
    username: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)],
    amount,
    at: new Date().toISOString(),
  }
}

export const startDemoFeed = () => {
  if (process.env.DEMO_LIVE_WINS === 'false') return
  // Only seed if the persisted file was empty/missing — once real (or
  // previously-generated demo) wins exist on disk, don't overwrite them.
  if (history.length === 0) {
    for (let i = 0; i < 10; i++) history.push(randomDemoWin())
    persist()
  }
  return setInterval(() => broadcastWin(randomDemoWin()), 10_000).unref()
}
