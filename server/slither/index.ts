// WebSocket entry point + matchmaking for Slither Royale.
//
// Trust model: the socket carries only steering inputs upward. Every message
// is size-capped, type-checked and rate-limited; the upgrade is refused
// unless the Origin matches (cross-site WebSocket hijacking) and the session
// cookie is valid. Buy-ins are taken server-side before a player is queued
// and refunded if they leave the queue.
import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { PLAYERS, norm } from '../../client/src/games/slither/engine'
import { BUY_INS, QUEUE_SEC, type ClientMsg, type ServerMsg } from '../../client/src/games/slither/protocol'
import { userFromCookieHeader, type SessionUser } from '../auth'
import { debit, refund, getBalance } from '../store'
import { PublicError } from '../security'
import { Match, type Conn } from './match'

type Client = Conn & { ws: WebSocket; user: SessionUser }
type Queue = { bet: number; players: SessionUser[]; startsAt: number; timer: NodeJS.Timeout }

const MAX_MSGS_PER_SEC = 120   // clients send one input per 60Hz tick, plus headroom for catch-up bursts
const MAX_CONNS_PER_IP = 6
const MAX_BUFFERED = 256 * 1024

const clients = new Map<string, Client>()       // userId -> live connection (one per user)
const queues = new Map<number, Queue>()         // buy-in -> waiting room
const matches = new Set<Match>()
const userMatch = new Map<string, Match>()
const joining = new Set<string>()               // userIds whose buy-in debit is in flight
const ipCounts = new Map<string, number>()
const recentResults = new Map<string, { msg: ServerMsg; at: number }>()   // last finished match per user, replayed on reconnect
const RESULT_TTL_MS = 2 * 60_000
const QUEUE_GRACE_MS = 5000   // a reload keeps its queue spot if it reconnects within this

const inQueue = (userId: string) => [...queues.values()].some(q => q.players.some(p => p.id === userId))

const notifyQueue = (q: Queue) => {
  const msg: ServerMsg = { t: 'queue', players: q.players.length, max: PLAYERS, startsInMs: Math.max(0, q.startsAt - Date.now()) }
  for (const p of q.players) clients.get(p.id)?.send(msg)
}

const launch = (q: Queue) => {
  clearTimeout(q.timer)
  queues.delete(q.bet)
  const match = new Match(
    q.bet,
    q.players.map(p => ({ userId: p.id, username: p.username, conn: clients.get(p.id) ?? null })),
    (m, results) => {
      for (const [id, msg] of results) recentResults.set(id, { msg, at: Date.now() })
      matches.delete(m)
      for (const [id, mm] of userMatch) if (mm === m) userMatch.delete(id)
    },
  )
  matches.add(match)
  for (const p of q.players) userMatch.set(p.id, match)
}

const enqueue = (bet: number, user: SessionUser) => {
  let q = queues.get(bet)
  if (!q) {
    const ref: Queue = { bet, players: [], startsAt: Date.now() + QUEUE_SEC * 1000, timer: setTimeout(() => launch(ref), QUEUE_SEC * 1000) }
    q = ref
    queues.set(bet, q)
  }
  q.players.push(user)
  if (q.players.length >= PLAYERS) launch(q)
  else notifyQueue(q)
}

const leaveQueue = async (userId: string) => {
  for (const q of queues.values()) {
    const i = q.players.findIndex(p => p.id === userId)
    if (i < 0) continue
    q.players.splice(i, 1)
    if (q.players.length === 0) { clearTimeout(q.timer); queues.delete(q.bet) } else notifyQueue(q)
    try { return await refund(userId, q.bet, 'queue-left') }
    catch (e) { console.error('slither refund failed', userId, e) }
  }
  return undefined
}

const handleJoin = async (client: Client, bet: unknown) => {
  const { user } = client
  if (typeof bet !== 'number' || !(BUY_INS as readonly number[]).includes(bet)) throw new PublicError('invalid buy-in')
  if (joining.has(user.id) || inQueue(user.id) || userMatch.has(user.id)) throw new PublicError('already in a game')
  joining.add(user.id)
  try {
    const balance = await debit(user.id, bet, 'queue')
    const live = clients.get(user.id)
    if (!live || live.ws.readyState !== WebSocket.OPEN) {   // disconnected while paying: give it back
      await refund(user.id, bet, 'queue-left')
      return
    }
    live.send({ t: 'queued', bet, balance })
    enqueue(bet, user)
  } finally {
    joining.delete(user.id)
  }
}

const onMessage = async (client: Client, msg: ClientMsg) => {
  const { user } = client
  switch (msg.t) {
    case 'in': {
      if (!Number.isSafeInteger(msg.seq) || typeof msg.want !== 'number' || !Number.isFinite(msg.want) || typeof msg.boost !== 'boolean') return
      userMatch.get(user.id)?.queueInput(user.id, msg.seq, norm(msg.want), msg.boost)   // norm(): never feed the engine an unbounded angle
      return
    }
    case 'join':
      return handleJoin(client, msg.bet)
    case 'leave': {
      const balance = await leaveQueue(user.id)
      client.send({ t: 'left', balance: balance ?? await getBalance(user.id) })
      return
    }
  }
}

export const attachSlither = (server: Server, allowedOrigin: string) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 })

  const reject = (socket: import('node:stream').Duplex, status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== '/ws/slither') return reject(socket, '404 Not Found')
    if (req.headers.origin !== allowedOrigin) return reject(socket, '403 Forbidden')
    const user = userFromCookieHeader(req.headers.cookie)
    if (!user) return reject(socket, '401 Unauthorized')
    const ip = req.socket.remoteAddress ?? 'unknown'
    if ((ipCounts.get(ip) ?? 0) >= MAX_CONNS_PER_IP) return reject(socket, '429 Too Many Requests')
    wss.handleUpgrade(req, socket, head, ws => onConnect(ws, user, ip))
  })

  setInterval(() => {
    for (const ws of wss.clients) {
      const s = ws as WebSocket & { alive?: boolean }
      if (s.alive === false) { s.terminate(); continue }
      s.alive = false
      s.ping()
    }
  }, 15_000).unref()

  setInterval(() => {
    const now = performance.now()
    for (const m of matches) m.advance(now)
  }, 8).unref()

  const onConnect = async (ws: WebSocket & { alive?: boolean }, user: SessionUser, ip: string) => {
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1)
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })
    ws.on('error', () => { /* the close handler below cleans up */ })

    const client: Client = {
      ws, user,
      send: msg => {
        if (ws.readyState !== WebSocket.OPEN) return
        if (msg.t === 'snap' && ws.bufferedAmount > MAX_BUFFERED) return   // slow client: drop frames, don't buffer without bound
        ws.send(JSON.stringify(msg))
      },
    }
    clients.get(user.id)?.ws.close(4000, 'replaced by a newer connection')
    clients.set(user.id, client)

    let windowStart = Date.now()
    let count = 0
    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      const now = Date.now()
      if (now - windowStart >= 1000) { windowStart = now; count = 0 }
      if (++count > MAX_MSGS_PER_SEC) return void ws.close(1008, 'rate limit')
      let msg: ClientMsg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (!msg || typeof msg !== 'object') return
      onMessage(client, msg).catch(e => {
        if (e instanceof PublicError) client.send({ t: 'error', message: e.message })
        else { console.error(e); client.send({ t: 'error', message: 'request failed' }) }
      })
    })

    ws.on('close', () => {
      const n = (ipCounts.get(ip) ?? 1) - 1
      if (n <= 0) ipCounts.delete(ip); else ipCounts.set(ip, n)
      if (clients.get(user.id) !== client) return   // superseded by a newer connection, which inherits the state
      clients.delete(user.id)
      userMatch.get(user.id)?.detach(user.id)
      if (inQueue(user.id)) {
        setTimeout(() => { if (!clients.has(user.id)) void leaveQueue(user.id) }, QUEUE_GRACE_MS)
      }
    })

    // resume whatever this user was already doing (page reload, reconnect)
    try {
      const balance = await getBalance(user.id)
      const q = [...queues.values()].find(x => x.players.some(p => p.id === user.id))
      const match = userMatch.get(user.id)
      client.send({ t: 'ready', balance, resume: !!(q || match) })
      if (q) { client.send({ t: 'queued', bet: q.bet, balance }); notifyQueue(q) }
      match?.attach(user.id, client)
      const recent = recentResults.get(user.id)
      if (recent && !match && Date.now() - recent.at < RESULT_TTL_MS) client.send(recent.msg)
      recentResults.delete(user.id)
    } catch (e) {
      console.error(e)
      ws.close(1011, 'error')
    }
  }
}
