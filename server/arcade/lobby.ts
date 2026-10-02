// WebSocket entry point + matchmaking for every arcade game (/ws/<game>).
//
// Trust model: the socket carries only inputs upward. Every message is
// size-capped, type-checked and rate-limited; the upgrade is refused unless
// the Origin matches (cross-site WebSocket hijacking) and the session cookie
// is valid. Buy-ins are taken server-side before a player is queued and
// refunded if they leave the queue.
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import { BUY_INS, type NetClientMsg, type NetServerMsg } from '../../client/src/games/net/protocol'
import { userFromCookieHeader, type SessionUser } from '../auth'
import { randomUUID } from 'node:crypto'
import { getBalance } from '../wallet'
import { placeStake, closeStake } from '../stakes'
import { PublicError, clientIp } from '../security'
import type { ArcadeEngine } from './engine'
import { Match, type Conn } from './match'
import { advanceSolo, onSoloConnect, type SoloEngine } from './solo'

type Client = Conn & { ws: WebSocket; user: SessionUser; engine: ArcadeEngine }
type Queue = { engine: ArcadeEngine; bet: number; players: SessionUser[]; startsAt: number; timer: NodeJS.Timeout }

const MAX_MSGS_PER_SEC = 120   // clients send up to one input per 60Hz tick, plus headroom for catch-up bursts
const MAX_CONNS_PER_IP = 8
const MAX_BUFFERED = 256 * 1024
const RESULT_TTL_MS = 2 * 60_000
const QUEUE_GRACE_MS = 5000   // a reload keeps its queue spot if it reconnects within this

const clients = new Map<string, Client>()       // userId -> live connection (one per user)
const queues = new Map<string, Queue>()         // "game:buy-in" -> waiting room
const matches = new Set<Match>()
const userMatch = new Map<string, Match>()
const joining = new Set<string>()               // userIds whose buy-in debit is in flight
const joinRefs = new Map<string, string>()      // userId -> wallet ref of the buy-in that is queued (so a cancel refunds exactly that one)
const ipCounts = new Map<string, number>()
const recentResults = new Map<string, { game: string; msg: NetServerMsg; at: number }>()   // last finished match per user, replayed on reconnect

const qKey = (game: string, bet: number) => `${game}:${bet}`
const queueOf = (userId: string) => [...queues.values()].find(q => q.players.some(p => p.id === userId))

const notifyQueue = (q: Queue) => {
  const msg: NetServerMsg = { t: 'queue', players: q.players.length, max: q.engine.maxHumans, startsInMs: Math.max(0, q.startsAt - Date.now()) }
  for (const p of q.players) clients.get(p.id)?.send(msg)
}

const launch = (q: Queue) => {
  clearTimeout(q.timer)
  queues.delete(qKey(q.engine.key, q.bet))
  const match = new Match(
    q.engine,
    q.bet,
    q.players.map(p => ({ userId: p.id, username: p.username, conn: clients.get(p.id) ?? null, stakeRef: joinRefs.get(p.id) ?? '' })),
    (m, results) => {
      for (const [id, msg] of results) recentResults.set(id, { game: m.gameKey, msg, at: Date.now() })
      matches.delete(m)
      for (const [id, mm] of userMatch) if (mm === m) userMatch.delete(id)
    },
  )
  matches.add(match)
  for (const p of q.players) { userMatch.set(p.id, match); joinRefs.delete(p.id) }   // the buy-in is now a played stake
}

const enqueue = (engine: ArcadeEngine, bet: number, user: SessionUser) => {
  const key = qKey(engine.key, bet)
  let q = queues.get(key)
  if (!q) {
    const ref: Queue = { engine, bet, players: [], startsAt: Date.now() + engine.queueSec * 1000, timer: setTimeout(() => launch(ref), engine.queueSec * 1000) }
    q = ref
    queues.set(key, q)
  }
  q.players.push(user)
  if (q.players.length >= engine.maxHumans) launch(q)
  else notifyQueue(q)
}

const leaveQueue = async (userId: string) => {
  const q = queueOf(userId)
  if (!q) return undefined
  q.players.splice(q.players.findIndex(p => p.id === userId), 1)
  if (q.players.length === 0) { clearTimeout(q.timer); queues.delete(qKey(q.engine.key, q.bet)) } else notifyQueue(q)
  const ref = joinRefs.get(userId)
  joinRefs.delete(userId)
  if (!ref) return undefined
  try { return await closeStake(userId, ref, 'refunded') }
  catch (e) { console.error('arcade refund failed', userId, e); return undefined }
}

const handleJoin = async (client: Client, bet: unknown) => {
  const { user, engine } = client
  if (typeof bet !== 'number' || !(BUY_INS as readonly number[]).includes(bet)) throw new PublicError('invalid buy-in')
  if (joining.has(user.id) || queueOf(user.id) || userMatch.has(user.id)) throw new PublicError('already in a game')
  joining.add(user.id)
  try {
    const ref = randomUUID()
    const balance = await placeStake(user.id, engine.key, bet, ref)
    const live = clients.get(user.id)
    if (!live || live.ws.readyState !== WebSocket.OPEN) {   // disconnected while paying: give it back
      await closeStake(user.id, ref, 'refunded')
      return
    }
    joinRefs.set(user.id, ref)
    live.send({ t: 'queued', bet, balance })
    enqueue(engine, bet, user)
  } finally {
    joining.delete(user.id)
  }
}

const onMessage = async (client: Client, msg: NetClientMsg) => {
  const { user, engine } = client
  switch (msg.t) {
    case 'in': {
      if (!Number.isSafeInteger(msg.seq)) return
      const match = userMatch.get(user.id)
      if (!match || match.gameKey !== engine.key) return
      const data = engine.parseInput(msg)
      if (data !== null) match.queueInput(user.id, msg.seq, data)
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

export const attachArcade = (server: Server, allowedOrigin: string, engines: ArcadeEngine[], soloEngines: SoloEngine[] = []) => {
  const byKey = new Map<string, ArcadeEngine | SoloEngine>([...engines, ...soloEngines].map(e => [e.key, e]))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })

  const reject = (socket: Duplex, status: string) => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const engine = byKey.get(path.startsWith('/ws/') ? path.slice(4) : '')
    if (!engine) return reject(socket, '404 Not Found')
    if (req.headers.origin !== allowedOrigin) return reject(socket, '403 Forbidden')
    const user = userFromCookieHeader(req.headers.cookie)
    if (!user) return reject(socket, '401 Unauthorized')
    const ip = clientIp(req)
    if ((ipCounts.get(ip) ?? 0) >= MAX_CONNS_PER_IP) return reject(socket, '429 Too Many Requests')
    wss.handleUpgrade(req, socket, head, ws => {
      if (!('maxHumans' in engine)) {
        // single-player game: the solo host owns the connection
        ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1)
        void onSoloConnect(ws, user, engine, () => {
          const n = (ipCounts.get(ip) ?? 1) - 1
          if (n <= 0) ipCounts.delete(ip); else ipCounts.set(ip, n)
        })
        return
      }
      void onConnect(ws, user, ip, engine)
    })
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
    advanceSolo(now)
  }, 8).unref()

  const onConnect = async (ws: WebSocket & { alive?: boolean }, user: SessionUser, ip: string, engine: ArcadeEngine) => {
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1)
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })
    ws.on('error', () => { /* the close handler below cleans up */ })

    const client: Client = {
      ws, user, engine,
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
      let msg: NetClientMsg
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
      if (queueOf(user.id)) {
        setTimeout(() => { if (!clients.has(user.id)) void leaveQueue(user.id) }, QUEUE_GRACE_MS)
      }
    })

    // resume whatever this user was already doing (page reload, reconnect)
    try {
      const balance = await getBalance(user.id)
      const q = queueOf(user.id)
      const match = userMatch.get(user.id)
      const sameGameMatch = match && match.gameKey === engine.key ? match : undefined
      const sameGameQueue = q && q.engine.key === engine.key ? q : undefined
      client.send({ t: 'ready', balance, resume: !!(sameGameQueue || sameGameMatch) })
      if (sameGameQueue) { client.send({ t: 'queued', bet: sameGameQueue.bet, balance }); notifyQueue(sameGameQueue) }
      sameGameMatch?.attach(user.id, client)
      const recent = recentResults.get(user.id)
      if (recent && recent.game === engine.key && !match && Date.now() - recent.at < RESULT_TTL_MS) client.send(recent.msg)
      if (recent && (recent.game === engine.key || Date.now() - recent.at >= RESULT_TTL_MS) && !match) recentResults.delete(user.id)
    } catch (e) {
      console.error(e)
      ws.close(1011, 'error')
    }
  }
}
