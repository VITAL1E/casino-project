import { createWorld, step, PLAYERS, type World, type Input } from '../../../client/src/games/chicken/engine'
import type { ChickenSnap } from '../../../client/src/games/chicken/net'
import type { ArcadeEngine } from '../engine'

const r2 = (n: number) => Math.round(n * 100) / 100
const clamp1 = (n: number) => Math.max(-1, Math.min(1, n))

export const chickenEngine: ArcadeEngine<World> = {
  key: 'chicken',
  label: 'Chicken Royale',
  gameId: 'o12',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: false,

  create: humans => createWorld(humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.chickens.map(c => ({ id: c.id, name: c.name, hue: c.hue, human: c.human })),
  outcome: (w, seat) => ({ place: w.chickens[seat].place, kills: w.chickens[seat].kills, won: w.winner === seat }),
  winnerName: w => w.chickens[w.winner].name,
  setAuto: (w, seat, auto) => { w.chickens[seat].auto = auto },

  parseInput: m => {
    if (![m.mx, m.mz, m.angle].every(v => typeof v === 'number' && Number.isFinite(v)) || typeof m.fire !== 'boolean') return null
    const a = m.angle as number
    return { mx: clamp1(m.mx as number), mz: clamp1(m.mz as number), angle: Math.atan2(Math.sin(a), Math.cos(a)), fire: m.fire } satisfies Input
  },
  idleInput: (w, seat) => ({ mx: 0, mz: 0, angle: w.chickens[seat].angle, fire: false }) satisfies Input,

  snapshot: (w, { full }): ChickenSnap => ({
    t: w.t,
    chickens: w.chickens.map(c => ({
      id: c.id, x: r2(c.x), z: r2(c.z), vx: r2(c.vx), vz: r2(c.vz), angle: r2(c.angle), mx: r2(c.moveX), mz: r2(c.moveZ),
      hp: c.hp, gold: c.gold, al: c.alive, falling: r2(c.falling), k: c.kills, p: c.place,
    })),
    eggs: w.eggs.map(e => [r2(e.x), r2(e.z), r2(e.vx), r2(e.vz), r2(e.life), e.owner, e.gold ? 1 : 0] as ChickenSnap['eggs'][number]),
    pickups: w.pickups.map(p => [r2(p.x), r2(p.z)] as [number, number]),
    events: full ? [] : w.events.splice(0),   // drained so each event is delivered exactly once
  }),
}
