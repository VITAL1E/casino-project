// One authoritative arcade match. The server owns the world: it steps the
// game's engine at a fixed 60Hz, applies each human's latest *validated*
// input, decides the winner and pays out. Clients only ever send inputs and
// only ever receive snapshots — there is no client-side outcome to tamper with.
import { randomUUID } from 'node:crypto'
import type { NetServerMsg } from '../../client/src/games/net/protocol'
import { SNAPSHOT_HZ } from '../../client/src/games/net/protocol'
import { closeStake } from '../stakes'
import { broadcastWin } from '../liveWins'
import { TICK, type ArcadeEngine, type SnapCtx } from './engine'

export type Conn = { send: (msg: NetServerMsg) => void }
export type Entrant = { userId: string; username: string; conn: Conn | null; stakeRef: string }
type SeqInput = { seq: number; data: unknown }
type Seat = Entrant & { seat: number; queue: SeqInput[]; queuedSeq: number; appliedSeq: number; autoUntil: number }

const SNAP_EVERY = Math.round(60 / SNAPSHOT_HZ)
const BEGIN_DELAY_MS = 3000
const AUTOPILOT_SEC = 20   // a disconnected player is bot-steered this long (covers reloads and dropped connections)
const MAX_QUEUED_INPUTS = 8   // bounds how far ahead of the simulation a client can queue
const round2 = (n: number) => Math.round(n * 100) / 100

export class Match {
  readonly id = randomUUID()
  private readonly world: unknown
  private readonly seats: Seat[]
  private readonly inputs: unknown[] = []
  private readonly mem: Record<string, unknown> = {}
  private acc = 0
  private last = performance.now()
  private readonly beginAt = performance.now() + BEGIN_DELAY_MS
  private settled = false

  constructor(
    private readonly engine: ArcadeEngine,
    readonly bet: number,
    entrants: Entrant[],
    private readonly onEnd: (m: Match, results: Map<string, NetServerMsg>) => void,
  ) {
    const { world, seats } = engine.create(entrants.map(e => e.username))
    this.world = world
    this.seats = entrants.map((e, i) => ({ ...e, seat: seats[i], queue: [], queuedSeq: 0, appliedSeq: 0, autoUntil: AUTOPILOT_SEC }))
    for (const seat of this.seats) this.sendStart(seat)
  }

  get gameKey() { return this.engine.key }

  has(userId: string) { return this.seats.some(s => s.userId === userId) }

  attach(userId: string, conn: Conn) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat) return
    seat.conn = conn
    seat.queue = []          // a new connection restarts its input counter at 1
    seat.queuedSeq = 0
    this.inputs[seat.seat] = this.engine.idleInput(this.world, seat.seat)   // resume from the autopilot state, not a stale input
    this.sendStart(seat)
  }

  detach(userId: string) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat) return
    seat.conn = null   // payout still goes to the account; meanwhile the bot AI steers
    seat.autoUntil = this.engine.time(this.world) + AUTOPILOT_SEC
  }

  // `data` comes out of engine.parseInput, so it is already validated and sanitised.
  // Tick-queue games consume exactly one input per tick, so sending them faster never makes anything
  // move faster and the client can replay the unacknowledged ones (prediction). Other games keep only the latest.
  queueInput(userId: string, seq: number, data: unknown) {
    const seat = this.seats.find(s => s.userId === userId)
    if (!seat || seq <= seat.queuedSeq) return   // out-of-order or replayed
    seat.queuedSeq = seq
    if (!this.engine.queueInputs) { this.inputs[seat.seat] = data; seat.appliedSeq = seq; return }
    seat.queue.push({ seq, data })
    while (seat.queue.length > MAX_QUEUED_INPUTS) seat.queue.shift()
  }

  advance(now: number) {
    if (this.settled) return
    if (now < this.beginAt) { this.last = now; return }
    const { engine, world: w } = this
    this.acc = Math.min(this.acc + (now - this.last) / 1000, 0.25)   // cap catch-up after a stall
    this.last = now
    while (this.acc >= TICK && !engine.over(w)) {
      for (const seat of this.seats) {
        engine.setAuto(w, seat.seat, !seat.conn && engine.time(w) < seat.autoUntil)
        const next = seat.queue.shift()   // none queued: the entity repeats its last input
        if (next) { seat.appliedSeq = next.seq; this.inputs[seat.seat] = next.data }
      }
      engine.step(w, TICK, this.inputs)
      this.acc -= TICK
      if (!engine.over(w) && ++this.tickCount % SNAP_EVERY === 0) this.broadcast(this.snap(false))
    }
    if (engine.over(w)) {
      this.settled = true
      this.broadcast(this.snap(false))
      void this.settle()
    }
  }

  private tickCount = 0

  private snap(full: boolean) {
    const ctx: SnapCtx = {
      mem: this.mem,
      full,
      ack: seat => this.seats.find(s => s.seat === seat)?.appliedSeq ?? 0,
    }
    return this.engine.snapshot(this.world, ctx)
  }

  private sendStart(seat: Seat) {
    const { engine, world } = this
    seat.conn?.send({
      t: 'start', you: seat.seat, bet: this.bet,
      beginsInMs: Math.max(0, this.beginAt - performance.now()),
      seats: engine.seatInfo(world),
      init: engine.init?.(world) ?? null,
      snap: this.snap(true),
    })
  }

  private broadcast(snap: unknown) {
    const msg: NetServerMsg = { t: 'snap', snap }
    for (const seat of this.seats) seat.conn?.send(msg)
  }

  private async settle() {
    const { engine, world } = this
    const winner = engine.winnerName(world)
    const results = new Map<string, NetServerMsg>()
    await Promise.all(this.seats.map(async seat => {
      const out = engine.outcome(world, seat.seat)
      try {
        let payout = 0
        let balance: number
        if (out.won) {
          payout = round2(this.bet * engine.payoutMultiplier)   // the whole pool, incl. the bot seats' share
          balance = await closeStake(seat.userId, seat.stakeRef, 'won', payout)   // closes the stake and pays, atomically and once
          broadcastWin({
            id: randomUUID(), gameId: engine.gameId, label: engine.label,
            username: seat.username, amount: payout, at: new Date().toISOString(),
          })
        } else {
          balance = await closeStake(seat.userId, seat.stakeRef, 'lost')
        }
        const end: NetServerMsg = { t: 'end', place: out.place, kills: out.kills, payout, bet: this.bet, balance, winner }
        if (!seat.conn) results.set(seat.userId, end)   // nobody saw it live: replay on reconnect
        seat.conn?.send(end)
      } catch (e) {
        console.error('arcade settle failed', engine.key, this.id, e)
        seat.conn?.send({ t: 'error', message: 'could not settle this match, contact support' })
      }
    }))
    this.onEnd(this, results)
  }
}
