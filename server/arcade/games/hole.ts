import { createWorld, step, PLAYERS, type World, type Input } from '../../../client/src/games/hole/engine'
import { KINDS, type HoleSnap } from '../../../client/src/games/hole/net'
import type { ArcadeEngine } from '../engine'
import { diffById } from '../delta'

const r1 = (n: number) => Math.round(n * 10) / 10

export const holeEngine: ArcadeEngine<World> = {
  key: 'hole',
  label: 'Hole Royale',
  gameId: 'o14',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: false,

  create: humans => createWorld(humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.holes.map(h => ({ id: h.id, name: h.name, hue: h.hue, human: h.human })),
  outcome: (w, seat) => ({ place: w.holes[seat].place, kills: w.holes[seat].kills, won: w.winner === seat }),
  winnerName: w => w.holes[w.winner].name,
  setAuto: (w, seat, auto) => { w.holes[seat].auto = auto },

  parseInput: m => {
    if (typeof m.want !== 'number' || !Number.isFinite(m.want)) return null
    return { want: Math.atan2(Math.sin(m.want), Math.cos(m.want)) } satisfies Input
  },
  idleInput: (w, seat) => ({ want: w.holes[seat].want }) satisfies Input,

  snapshot: (w, { mem, full }): HoleSnap => {
    const things = diffById(w.things, mem, 'things', full, t => [t.id, r1(t.x), r1(t.y), r1(t.r), KINDS.indexOf(t.kind), Math.round(t.hue)] as HoleSnap['thingsAdd'][number])
    return {
      t: w.t,
      holes: w.holes.map(h => ({ id: h.id, x: r1(h.x), y: r1(h.y), area: Math.round(h.area), al: h.alive, k: h.kills, p: h.place })),
      thingsAdd: things.add,
      thingsDel: things.del,
      sucked: w.sucked.map(s => ({ id: s.id, x: r1(s.x), y: r1(s.y), r: r1(s.r), kind: KINDS.indexOf(s.kind), hue: Math.round(s.hue), t: Math.round(s.t * 100) / 100, hole: s.hole })),
    }
  },
}
