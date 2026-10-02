// Host for the single-player, server-authoritative arcade games (Flappy, Road Cross...).
// The session lives on the server: it steps the game's simulation at a fixed 60Hz, applies the
// player's actions, decides crash / cash-out and pays out. The client only ever sends actions.
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { SoloClientMsg, SoloServerMsg } from '../../client/src/games/net/soloProtocol'
import type { SessionUser } from '../auth'
import { getBalance } from '../wallet'
import { placeStake, closeStake } from '../stakes'
import { PublicError, parseStake } from '../security'
import { broadcastWin } from '../liveWins'
import { TICK } from './engine'
import { nextBet, type Proof, type Rng } from '../classics/fair'

export interface SoloEngine<S = any> {
  key: string
  label: string
  gameId: string
  fair?: boolean                                              // draws from the provably fair stream (Crash)
  create(opts: Record<string, unknown>, rng?: Rng): S | null  // validate options; null = invalid
  act(s: S, action: 'flap' | 'go'): void
  canCash(s: S): boolean
  cash(s: S): void                                            // mark the run as cashed
  step(s: S, dt: number): void
  status(s: S): 'ready' | 'live' | 'dead' | 'cashed'         // 'dead'/'cashed' end the session
  mult(s: S): number                                          // multiplier paid if the run is cashed
  snapshot(s: S): unknown
}

type Session = {
  id: string
  engine: SoloEngine
  state: unknown
  bet: number
  userId: string
  username: string
  proof?: Proof
  ended: boolean
  acc: number
  last: number
  ticks: number
  lastActivity: number
}

const SNAP_EVERY = 2               // 30 snapshots / second
const IDLE_MS = 5 * 60_000         // an abandoned run is settled: cashed if it can be, refunded if it never started
const MAX_MSGS_PER_SEC = 60
const MAX_BUFFERED = 256 * 1024
const round2 = (n: number) => Math.round(n * 100) / 100

const sessions = new Map<string, Session>()                          // userId -> running session
const conns = new Map<string, { ws: WebSocket; send: (m: SoloServerMsg) => void }>()   // userId -> live connection
const starting = new Set<string>()

const send = (userId: string, msg: SoloServerMsg) => conns.get(userId)?.send(msg)

const settle = async (s: Session) => {
  if (s.ended) return
  s.ended = true
  sessions.delete(s.userId)
  const { engine } = s
  const st = engine.status(s.state)
  try {
    if (st === 'cashed') {
      const mult = engine.mult(s.state)
      const payout = round2(s.bet * mult)
      const balance = await closeStake(s.userId, s.id, 'won', payout)
      broadcastWin({ id: randomUUID(), gameId: engine.gameId, label: engine.label, username: s.username, amount: payout, at: new Date().toISOString() })
      send(s.userId, { t: 'done', result: 'cash', payout, bet: s.bet, balance, mult, snap: engine.snapshot(s.state), proof: s.proof })
    } else if (st === 'ready') {
      // never started: give the stake back
      const balance = await closeStake(s.userId, s.id, 'refunded')
      send(s.userId, { t: 'done', result: 'crash', payout: s.bet, bet: s.bet, balance, mult: 1, snap: engine.snapshot(s.state), proof: s.proof })
    } else {
      send(s.userId, { t: 'done', result: 'crash', payout: 0, bet: s.bet, balance: await closeStake(s.userId, s.id, 'lost'), mult: 0, snap: engine.snapshot(s.state), proof: s.proof })
    }
  } catch (e) {
    console.error('solo settle failed', engine.key, s.id, e)
    send(s.userId, { t: 'error', message: 'could not settle this run, contact support' })
  }
}

// called from the shared 8ms timer in lobby.ts
export const advanceSolo = (now: number) => {
  for (const s of sessions.values()) {
    if (s.ended) continue
    const { engine } = s
    s.acc = Math.min(s.acc + (now - s.last) / 1000, 0.25)
    s.last = now
    while (s.acc >= TICK && engine.status(s.state) !== 'dead' && engine.status(s.state) !== 'cashed') {
      engine.step(s.state, TICK)
      s.acc -= TICK
      if (++s.ticks % SNAP_EVERY === 0) send(s.userId, { t: 'snap', snap: engine.snapshot(s.state) })
    }
    const st = engine.status(s.state)
    if (st === 'dead' || st === 'cashed') void settle(s)
    else if (Date.now() - s.lastActivity > IDLE_MS) {
      if (engine.canCash(s.state)) engine.cash(s.state)
      void settle(s)
    }
  }
}

const handleStart = async (user: SessionUser, engine: SoloEngine, msg: SoloClientMsg & { t: 'start' }) => {
  if (sessions.has(user.id) || starting.has(user.id)) throw new PublicError('you already have a run in progress')
  const bet = parseStake(msg.bet)
  const opts = msg.opts && typeof msg.opts === 'object' ? msg.opts : {}
  if (!engine.create(opts)) throw new PublicError('invalid options')   // validate before any money moves
  starting.add(user.id)
  try {
    const id = randomUUID()
    const balance = await placeStake(user.id, engine.key, bet, id)
    const fair = engine.fair ? await nextBet(user.id) : undefined
    const state = engine.create(opts, fair?.rng)
    if (!state) throw new PublicError('invalid options')
    const session: Session = {
      id, engine, state, bet, userId: user.id, username: user.username, proof: fair?.proof,
      ended: false, acc: 0, last: performance.now(), ticks: 0, lastActivity: Date.now(),
    }
    sessions.set(user.id, session)
    send(user.id, { t: 'started', balance, bet, snap: engine.snapshot(state), proof: fair?.proof })
  } finally {
    starting.delete(user.id)
  }
}

const handleAct = (user: SessionUser, engine: SoloEngine, a: unknown) => {
  const s = sessions.get(user.id)
  if (!s || s.engine !== engine || s.ended) return
  s.lastActivity = Date.now()
  if (a === 'flap' || a === 'go') engine.act(s.state, a)
  else if (a === 'cash' && engine.canCash(s.state)) {
    engine.cash(s.state)
    void settle(s)   // pay out now, not on the next tick
  }
}

export const onSoloConnect = async (ws: WebSocket & { alive?: boolean }, user: SessionUser, engine: SoloEngine, onClosed: () => void) => {
  ws.alive = true
  ws.on('pong', () => { ws.alive = true })
  ws.on('error', () => { /* the close handler below cleans up */ })

  const conn = {
    ws,
    send: (m: SoloServerMsg) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (m.t === 'snap' && ws.bufferedAmount > MAX_BUFFERED) return   // slow client: drop frames
      ws.send(JSON.stringify(m))
    },
  }
  conns.get(user.id)?.ws.close(4000, 'replaced by a newer connection')
  conns.set(user.id, conn)

  let windowStart = Date.now()
  let count = 0
  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    const now = Date.now()
    if (now - windowStart >= 1000) { windowStart = now; count = 0 }
    if (++count > MAX_MSGS_PER_SEC) return void ws.close(1008, 'rate limit')
    let msg: SoloClientMsg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'act') return handleAct(user, engine, msg.a)
    if (msg.t === 'start') {
      handleStart(user, engine, msg).catch(e => {
        if (e instanceof PublicError) conn.send({ t: 'error', message: e.message })
        else { console.error(e); conn.send({ t: 'error', message: 'request failed' }) }
      })
    }
  })

  ws.on('close', () => {
    onClosed()
    if (conns.get(user.id) === conn) conns.delete(user.id)   // the session itself keeps running (or times out)
  })

  try {
    const balance = await getBalance(user.id)
    const s = sessions.get(user.id)
    const mine = s && s.engine === engine ? s : undefined
    conn.send({ t: 'ready', balance, resume: !!mine })
    if (mine) conn.send({ t: 'started', balance, bet: mine.bet, snap: engine.snapshot(mine.state), proof: mine.proof })
  } catch (e) {
    console.error(e)
    ws.close(1011, 'error')
  }
}
