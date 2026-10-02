import { createWorld, step, PLAYERS, type World, type Input } from '../../../client/src/games/paper/engine'
import type { PaperSnap } from '../../../client/src/games/paper/net'
import type { ArcadeEngine } from '../engine'

const r2 = (n: number) => Math.round(n * 100) / 100

export const paperEngine: ArcadeEngine<World> = {
  key: 'paper',
  label: 'Paper Royale',
  gameId: 'o13',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: false,

  create: humans => createWorld(humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.players.map(p => ({ id: p.id, name: p.name, hue: p.hue, human: p.human })),
  outcome: (w, seat) => ({ place: w.players[seat].place, kills: w.players[seat].kills, won: w.winner === seat }),
  winnerName: w => w.players[w.winner].name,
  setAuto: (w, seat, auto) => { w.players[seat].auto = auto },

  parseInput: m => {
    if (typeof m.want !== 'number' || !Number.isFinite(m.want)) return null
    return { want: Math.atan2(Math.sin(m.want), Math.cos(m.want)) } satisfies Input
  },
  idleInput: (w, seat) => ({ want: w.players[seat].angle }) satisfies Input,

  snapshot: (w, { mem, full }): PaperSnap => {
    const grid = Buffer.from(w.owner).toString('base64')
    const changed = full || mem.owner !== grid
    if (!full) mem.owner = grid
    return {
      t: w.t,
      players: w.players.map(p => ({ id: p.id, x: r2(p.x), y: r2(p.y), angle: r2(p.angle), al: p.alive, k: p.kills, p: p.place, trail: p.trail })),
      ...(changed ? { owner: grid } : {}),
    }
  },
}
