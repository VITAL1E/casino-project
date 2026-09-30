// Offline single-player replay, kept as a test/debug utility: the live game is
// simulated by the server (server/slither/), never by this file.
import { createWorld, step, TICK, MAX_TICKS, PLAYERS, type Input } from './engine'

export type RecordedInput = Input

export type ReplayResult = { won: boolean; place: number; kills: number; payoutMultiplier: number }

export const replayRound = (seed: number, inputs: RecordedInput[]): ReplayResult => {
  const { world: w, seats } = createWorld(seed, ['You'])
  const me = w.snakes[seats[0]]
  let i = 0
  while (!w.over && w.tick < MAX_TICKS) {
    const input = inputs[i] ?? inputs[inputs.length - 1]
    const all: (Input | undefined)[] = []
    all[me.id] = input
    step(w, TICK, all)
    i++
  }
  const won = w.over && me.id === w.winner
  return { won, place: me.place || PLAYERS, kills: me.kills, payoutMultiplier: won ? PLAYERS : 0 }
}
