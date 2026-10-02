import { createWorld, step, PLAYERS, type World, type Input } from '../../../client/src/games/agar/engine'
import type { AgarSnap } from '../../../client/src/games/agar/net'
import type { ArcadeEngine } from '../engine'
import { diffById } from '../delta'

export const agarEngine: ArcadeEngine<World> = {
  key: 'agar',
  label: 'Agar Royale',
  gameId: 'o11',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: false,

  create: humans => createWorld(humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.cells.map(c => ({ id: c.id, name: c.name, hue: c.hue, human: c.human })),
  outcome: (w, seat) => ({ place: w.cells[seat].place, kills: w.cells[seat].kills, won: w.winner === seat }),
  winnerName: w => w.cells[w.winner].name,
  setAuto: (w, seat, auto) => { w.cells[seat].auto = auto },

  parseInput: m => {
    if (typeof m.want !== 'number' || !Number.isFinite(m.want)) return null
    return { want: Math.atan2(Math.sin(m.want), Math.cos(m.want)) } satisfies Input
  },
  idleInput: (w, seat) => ({ want: w.cells[seat].want }) satisfies Input,

  snapshot: (w, { mem, full }): AgarSnap => {
    const food = diffById(w.food, mem, 'food', full, f => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.v * 10) / 10, Math.round(f.hue)] as AgarSnap['foodAdd'][number])
    return {
      t: w.t,
      cells: w.cells.map(c => ({
        id: c.id, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10,
        mass: Math.round(c.mass * 10) / 10, hp: Math.round(c.hp), al: c.alive, k: c.kills, p: c.place,
      })),
      foodAdd: food.add,
      foodDel: food.del,
    }
  },
}
