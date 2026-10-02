import { createWorld, step, norm, PLAYERS, type World, type Input } from '../../../client/src/games/slither/engine'
import type { Snap } from '../../../client/src/games/slither/protocol'
import type { ArcadeEngine } from '../engine'

export const slitherEngine: ArcadeEngine<World> = {
  key: 'slither',
  label: 'Slither Royale',
  gameId: 'o10',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: true,   // one input consumed per tick => the client can predict its own snake

  create: humans => createWorld(Math.floor(Math.random() * 2 ** 31), humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.snakes.map(s => ({ id: s.id, name: s.name, hue: s.hue, human: s.human })),
  outcome: (w, seat) => ({ place: w.snakes[seat].place, kills: w.snakes[seat].kills, won: w.winner === seat }),
  winnerName: w => w.snakes[w.winner].name,
  setAuto: (w, seat, auto) => { w.snakes[seat].auto = auto },

  parseInput: m => {
    if (typeof m.want !== 'number' || !Number.isFinite(m.want) || typeof m.boost !== 'boolean') return null
    return { want: norm(m.want), boost: m.boost } satisfies Input   // norm(): never feed the engine an unbounded angle
  },
  idleInput: (w, seat) => ({ want: w.snakes[seat].angle, boost: false }) satisfies Input,

  snapshot: (w, { mem, ack, full }): Snap => {
    const known = full ? new Set<number>() : (mem.prevFood as Set<number> | undefined) ?? new Set<number>()
    const cur = new Set<number>()
    const foodAdd: Snap['foodAdd'] = []
    for (const f of w.food) {
      cur.add(f.id)
      if (!known.has(f.id)) foodAdd.push([f.id, Math.round(f.x), Math.round(f.y), Math.round(f.v * 10) / 10, Math.round(f.hue)])
    }
    const foodDel = [...known].filter(id => !cur.has(id))
    if (!full) mem.prevFood = cur
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
        ack: ack(s.id),
        k: s.kills,
        p: s.place,
        b: s.alive ? s.body.flatMap(p => [Math.round(p.x), Math.round(p.y)]) : [],
      })),
    }
  },
}
