import { createWorld, step, PLAYERS, type World, type Input } from '../../../client/src/games/storm/engine'
import type { StormInit, StormSnap } from '../../../client/src/games/storm/net'
import type { ArcadeEngine } from '../engine'
import { diffById } from '../delta'

const r2 = (n: number) => Math.round(n * 100) / 100
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export const stormEngine: ArcadeEngine<World> = {
  key: 'storm',
  label: 'Storm Royale',
  gameId: 'o17',
  payoutMultiplier: PLAYERS,
  maxHumans: PLAYERS,
  queueSec: 10,
  queueInputs: true,   // one-shot actions (jump / build / weapon slot) must never be dropped

  create: humans => createWorld(humans),
  step: (w, dt, inputs) => step(w, dt, inputs as (Input | undefined)[]),
  over: w => w.over,
  time: w => w.t,
  seatInfo: w => w.players.map(p => ({ id: p.id, name: p.name, hue: p.hue, human: p.human })),
  outcome: (w, seat) => ({ place: w.players[seat].place, kills: w.players[seat].kills, won: w.winner === seat }),
  winnerName: w => w.players[w.winner].name,
  setAuto: (w, seat, auto) => { w.players[seat].auto = auto },
  init: (w): StormInit => ({ seed: w.seed }),

  parseInput: m => {
    if (!finite(m.mx) || !finite(m.mz) || !finite(m.yaw) || !finite(m.pitch)) return null
    if (typeof m.fire !== 'boolean' || typeof m.jump !== 'boolean' || typeof m.sprint !== 'boolean' || typeof m.build !== 'boolean') return null
    const len = Math.hypot(m.mx, m.mz)
    const input: Input = {
      mx: len > 1 ? m.mx / len : m.mx, mz: len > 1 ? m.mz / len : m.mz,   // movement is at most unit speed
      yaw: angle(m.yaw), pitch: Math.max(-1.3, Math.min(1.3, m.pitch)),
      fire: m.fire, jump: m.jump, sprint: m.sprint, build: m.build,
    }
    if (m.aim !== undefined) {
      if (!Array.isArray(m.aim) || m.aim.length !== 3 || !m.aim.every(finite)) return null
      const [x, y, z] = m.aim as number[]
      const l = Math.hypot(x, y, z)
      if (l < 1e-6) return null
      input.aim = [x / l, y / l, z / l]   // direction only: magnitude never matters
    }
    if (m.slot !== undefined) {
      if (!Number.isInteger(m.slot) || (m.slot as number) < 0 || (m.slot as number) > 3) return null
      input.slot = m.slot as number
    }
    return input
  },
  idleInput: (w, seat) => ({ mx: 0, mz: 0, yaw: w.players[seat].yaw, pitch: 0, fire: false, jump: false, sprint: false, build: false }) satisfies Input,

  snapshot: (w, { mem, full }): StormSnap => {
    const loot = diffById(w.loot, mem, 'loot', full, l => [l.id, r2(l.x), r2(l.z), l.kind] as StormSnap['lootAdd'][number])
    const builds = diffById(w.map.boxes.filter(b => b.kind === 'build'), mem, 'builds', full, b => [b.id, b.x, b.z, b.w, b.d, b.h, b.owner] as StormSnap['buildAdd'][number])
    return {
      t: w.t,
      players: w.players.map(p => ({
        id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), pitch: r2(p.pitch),
        hp: Math.round(p.hp), shield: Math.round(p.shield), mats: Math.round(p.mats), weapons: p.weapons, slot: p.slot,
        al: p.alive, k: p.kills, p: p.place, lastShot: r2(p.lastShot),
      })),
      lootAdd: loot.add, lootDel: loot.del,
      buildAdd: builds.add, buildDel: builds.del,
      events: full ? [] : w.events.splice(0),   // drained so each event is delivered exactly once
    }
  },
}
