// Shared by the browser (for local prediction) and the Node verification server
// (as the single source of truth). Both run the exact same code, so a round's
// outcome is whatever this function says it is — nothing the client sends about
// "who won" or "what the payout is" is ever trusted.
import { createWorld, step, TICK, MAX_TICKS, PLAYERS, type World } from './engine'

export type RecordedInput = { want: number; boost: boolean }

export type ReplayResult = {
  won: boolean
  place: number
  kills: number
  payoutMultiplier: number   // PLAYERS if won, 0 otherwise — caller multiplies by the bet
}

// Replays a round from its seed and the human player's recorded per-tick inputs.
// Bots and food are fully determined by the seed, so nothing here depends on
// anything the client claims beyond "this is what I steered on each tick".
// Ticks beyond the recorded inputs (player went idle, or sent too few) repeat
// the last known want/boost — you can't cheat by sending a short log, you just
// stop steering.
export const replayRound = (seed: number, inputs: RecordedInput[]): ReplayResult => {
  const w: World = createWorld(seed)
  const me = w.snakes.find(s => s.human)!
  let i = 0
  while (!w.over && w.tick < MAX_TICKS) {
    const input = inputs[i] ?? inputs[inputs.length - 1]
    step(w, TICK, input?.want, input?.boost ?? false)
    i++
  }
  const won = w.over && me.id === w.winner
  return { won, place: me.place || PLAYERS, kills: me.kills, payoutMultiplier: won ? PLAYERS : 0 }
}
