// One authoritative Slither Royale match. The server owns the world: it steps
// the shared engine at a fixed 60Hz, applies each human's latest *validated*
// input, decides the winner and pays out. Clients only ever send steering
// inputs and only ever receive snapshots — there is no client-side outcome to
// tamper with.
import { randomUUID, randomInt } from 'node:crypto'
import { createWorld, step, TICK, PLAYERS, type World, type Input } from '../../client/src/games/slither/engine'
import { SNAPSHOT_HZ, type ServerMsg, type Snap, type SeatInfo } from '../../client/src/games/slither/protocol'
import { credit, getBalance } from '../store'
import { broadcastWin } from '../liveWins'

export type Conn = { send: (msg: ServerMsg) => void }
export type Entrant = { userId: string; username: string; conn: Conn | null }
type SeqInput = Input & { seq: number }
type Seat = Entrant & { snakeId: number; queue: SeqInput[]; queuedSeq: number; appliedSeq: number; autoUntil: number }

const SNAP_EVERY = Math.round(60 / SNAPSHOT_HZ)
const BEGIN_DELAY_MS = 3000
const AUTOPILOT_SEC = 20   // a disconnected player is bot-steered this long (covers reloads and dropped connections)
const MAX_QUEUED_INPUTS = 8   // bounds how far ahead of the simulation a client can queue
const round2 = (n: number) => Math.round(n * 100) / 100

export class Match {
  readonly id = randomUUID()
  private readonly world: World
  private readonly seats: Seat[]
  private readonly inputs: (Input | undefined)[] = []
  private prevFood = new Set<number>()
  private acc = 0
  private last = performance.now()
  private readonly beginAt = performance.now() + BEGIN_DELAY_MS
  private settled = false

  constructor(readonly bet: number, entrants: Entrant[], private readonly onEnd: (m: Match, results: Map<string, ServerMsg>) => void) {
    const seed = randomInt(0, 2 ** 31)   // server-chosen, never influenced by any client
    const { world, seats } = createWorld(seed, entrants.map(e => e.username))
    this.world = world
    this.seats = entrants.map((e, i) => ({ ...e, snakeId: seats[i], queue: [], queuedSeq: 0, appliedSeq: 0, autoUntil: AUTOPILOT_SEC }))
    for (const seat of this.seats) this.sendStart(seat)
  }

  has(userId: string) { return this.seats.some(s => s.userId === userId) }

  attach(userId: string, conn: Conn) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat) return
    seat.conn = conn
    seat.queue = []          // a new connection restarts its input counter at 1
    seat.queuedSeq = 0
    const snake = this.world.snakes[seat.snakeId]
    this.inputs[seat.snakeId] = { want: snake.angle, boost: false }   // resume from the autopilot heading, not a stale input
    this.sendStart(seat)
  }

  detach(userId: string) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat) return
    seat.conn = null   // payout still goes to the account; meanwhile the bot AI steers the snake
    seat.autoUntil = this.world.t + AUTOPILOT_SEC
  }

  // `want` must already be a finite angle — see the validation in ./index.ts.
  // Inputs are per-client-tick commands: the simulation consumes exactly one per tick, so
  // sending them faster never makes a snake move faster, and the client can replay
  // the ones it has not seen acknowledged (client-side prediction).
  queueInput(userId: string, seq: number, want: number, boost: boolean) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat || seq <= seat.queuedSeq) return   // out-of-order or replayed
    seat.queuedSeq = seq
    seat.queue.push({ seq, want, boost })
    while (seat.queue.length > MAX_QUEUED_INPUTS) seat.queue.shift()
  }

  advance(now: number) {
    if (this.settled) return
    if (now < this.beginAt) { this.last = now; return }
    const w = this.world
    this.acc = Math.min(this.acc + (now - this.last) / 1000, 0.25)   // cap catch-up after a stall
    this.last = now
    while (this.acc >= TICK && !w.over) {
      for (const seat of this.seats) {
        w.snakes[seat.snakeId].auto = !seat.conn && w.t < seat.autoUntil
        const next = seat.queue.shift()   // none queued: the snake repeats its last input
        if (next) { seat.appliedSeq = next.seq; this.inputs[seat.snakeId] = next }
      }
      step(w, TICK, this.inputs)
      this.acc -= TICK
      if (!w.over && w.tick % SNAP_EVERY === 0) this.broadcast(this.diffSnap())
    }
    if (w.over) {
      this.settled = true
      this.broadcast(this.diffSnap())
      void this.settle()
    }
  }

  private fullSnap(): Snap { return this.buildSnap(new Set()) }

  private diffSnap(): Snap {
    const snap = this.buildSnap(this.prevFood)
    this.prevFood = new Set(this.world.food.map(f => f.id))
    return snap
  }

  private buildSnap(known: Set<number>): Snap {
    const w = this.world
    const cur = new Set<number>()
    const foodAdd: Snap['foodAdd'] = []
    for (const f of w.food) {
      cur.add(f.id)
      if (!known.has(f.id)) foodAdd.push([f.id, Math.round(f.x), Math.round(f.y), Math.round(f.v * 10) / 10, Math.round(f.hue)])
    }
    const foodDel = [...known].filter(id => !cur.has(id))
    return {
      time: w.t,
      foodAdd,
      foodDel,
      snakes: w.snakes.map(s => ({
        id: s.id,
        x: Math.round(s.x * 100) / 100,
        y: Math.round(s.y * 100) / 100,
        a: Math.round(s.angle * 1000) / 1000,
        len: Math.round(s.len),
        hp: Math.round(s.hp),
        al: s.alive,
        bo: s.boost,
        ack: this.seats.find(x => x.snakeId === s.id)?.appliedSeq ?? 0,
        k: s.kills,
        p: s.place,
        b: s.alive ? s.body.flatMap(p => [Math.round(p.x), Math.round(p.y)]) : [],
      })),
    }
  }

  private sendStart(seat: Seat) {
    const seats: SeatInfo[] = this.world.snakes.map(s => ({ id: s.id, name: s.name, hue: s.hue, human: s.human }))
    seat.conn?.send({
      t: 'start', you: seat.snakeId, bet: this.bet,
      beginsInMs: Math.max(0, this.beginAt - performance.now()),
      seats, snap: this.fullSnap(),
    })
  }

  private broadcast(snap: Snap) {
    const msg: ServerMsg = { t: 'snap', snap }
    for (const seat of this.seats) seat.conn?.send(msg)
  }

  private async settle() {
    const w = this.world
    const winner = w.snakes[w.winner]
    const results = new Map<string, ServerMsg>()
    await Promise.all(this.seats.map(async seat => {
      const me = w.snakes[seat.snakeId]
      try {
        let payout = 0
        let balance: number
        if (me.id === w.winner) {
          payout = round2(this.bet * PLAYERS)   // the whole pool, incl. the bot seats' share
          balance = await credit(seat.userId, payout, this.id)
          broadcastWin({
            id: randomUUID(), gameId: 'o10', label: 'Slither Royale',
            username: seat.username, amount: payout, at: new Date().toISOString(),
          })
        } else {
          balance = await getBalance(seat.userId)
        }
        const end: ServerMsg = { t: 'end', place: me.place, kills: me.kills, payout, bet: this.bet, balance, winner: winner.name }
        if (!seat.conn) results.set(seat.userId, end)   // nobody saw it live: replay on reconnect
        seat.conn?.send(end)
      } catch (e) {
        console.error('slither settle failed', this.id, e)
        seat.conn?.send({ t: 'error', message: 'could not settle this match, contact support' })
      }
    }))
    this.onEnd(this, results)
  }
}
