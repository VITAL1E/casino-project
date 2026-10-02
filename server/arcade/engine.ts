// What a game has to provide to run on the shared arcade server. The match
// loop, matchmaking, wallet, autopilot and payouts live in ./match.ts and
// ./lobby.ts; a game only describes its simulation and its wire format.
import type { SeatInfo } from '../../client/src/games/net/protocol'

export const TICK = 1 / 60   // every match is simulated at a fixed 60Hz

export type SnapCtx = {
  mem: Record<string, unknown>          // per-match scratch space (e.g. the food ids the last snapshot contained)
  ack: (seat: number) => number         // last input seq applied for a seat (tick-queue games)
  full: boolean                         // true for the first snapshot a client gets: send everything, no deltas
}

export type Outcome = { place: number; kills: number; won: boolean }

export interface ArcadeEngine<W = any> {
  key: string                  // WebSocket path segment: /ws/<key>
  label: string                // shown in the live wins feed
  gameId: string               // matches an id in client/src/data/casino.ts
  payoutMultiplier: number     // winner is paid bet * this (the pool incl. the bot seats' share)
  maxHumans: number
  queueSec: number             // how long to wait for other humans before bots fill in
  queueInputs: boolean         // true: one queued input is consumed per tick (enables client prediction); false: latest input wins

  create(humans: string[]): { world: W; seats: number[] }   // seats[i] = entity id of humans[i]
  step(w: W, dt: number, inputs: unknown[]): void           // inputs indexed by entity id
  over(w: W): boolean
  time(w: W): number
  seatInfo(w: W): SeatInfo[]
  outcome(w: W, seat: number): Outcome
  winnerName(w: W): string
  setAuto(w: W, seat: number, auto: boolean): void          // a disconnected human is steered by the bot AI
  parseInput(msg: Record<string, unknown>): unknown | null  // validate + sanitise; null = drop the message
  idleInput(w: W, seat: number): unknown | undefined        // input to resume from after a reconnect
  init?(w: W): unknown                                       // static data sent once in 'start'
  snapshot(w: W, ctx: SnapCtx): unknown
}
