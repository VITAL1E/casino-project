export const ROUND_SEC = 60
export const PLAYERS = 10
export const R_START = 12
export const R_END = 4.5
export const MAX_HP = 6

const SPEED = 5.5
const EGG_SPEED = 15
const EGG_LIFE = 1.1
const GOLD_SHOTS = 3
const HIT_DIST = 0.75
const FALL_TIME = 1

export type Chicken = {
  id: number
  name: string
  hue: number
  human: boolean
  x: number
  z: number
  vx: number
  vz: number
  angle: number
  moveX: number
  moveZ: number
  hp: number
  cooldown: number
  gold: number
  alive: boolean
  falling: number
  kills: number
  place: number
  skill: number
  think: number
  fire: boolean
}

export type Egg = { x: number; z: number; vx: number; vz: number; life: number; owner: number; gold: boolean }
export type Pickup = { x: number; z: number }

export type GameEvent =
  | { type: 'hit'; x: number; z: number; hue: number }
  | { type: 'splat'; x: number; z: number; gold: boolean }
  | { type: 'boom'; x: number; z: number }
  | { type: 'throw'; x: number; z: number }
  | { type: 'cooked'; x: number; z: number; hue: number }
  | { type: 'splash'; x: number; z: number }
  | { type: 'gold'; x: number; z: number }

export type World = {
  t: number
  chickens: Chicken[]
  eggs: Egg[]
  pickups: Pickup[]
  events: GameEvent[]
  pickupTimer: number
  over: boolean
  winner: number
}

const NAMES = ['Clucky', 'Nugget', 'Drumstick', 'Henrietta', 'Yolko', 'Clucknorris', 'Pecky', 'Omelette', 'Rooster']

export const arenaRadius = (t: number) => R_START + (R_END - R_START) * Math.min(t / ROUND_SEC, 1)

export const createWorld = (): World => {
  const humanSlot = Math.floor(Math.random() * PLAYERS)
  let bot = 0
  const chickens: Chicken[] = Array.from({ length: PLAYERS }, (_, i) => {
    const a = (i / PLAYERS) * Math.PI * 2
    const human = i === humanSlot
    return {
      id: i,
      name: human ? 'You' : NAMES[bot++],
      hue: (i * 36 + 20) % 360,
      human,
      x: Math.cos(a) * 8,
      z: Math.sin(a) * 8,
      vx: 0, vz: 0,
      angle: a + Math.PI,
      moveX: 0, moveZ: 0,
      hp: MAX_HP,
      cooldown: 0.5 + Math.random(),
      gold: 0,
      alive: true,
      falling: 0,
      kills: 0,
      place: 0,
      skill: 0.4 + Math.random() * 0.35,
      think: Math.random() * 0.3,
      fire: false,
    }
  })
  return { t: 0, chickens, eggs: [], pickups: [], events: [], pickupTimer: 4, over: false, winner: -1 }
}

const aliveCount = (w: World) => w.chickens.reduce((n, c) => n + (c.alive ? 1 : 0), 0)

const eliminate = (w: World, c: Chicken, by: Chicken | null, fell: boolean) => {
  if (!c.alive) return
  c.alive = false
  c.place = aliveCount(w) + 1
  if (by && by !== c) by.kills++
  w.events.push(fell ? { type: 'splash', x: c.x, z: c.z } : { type: 'cooked', x: c.x, z: c.z, hue: c.hue })
}

const hurt = (w: World, c: Chicken, by: Chicken, dx: number, dz: number, power: number) => {
  if (!c.alive || c.falling > 0) return
  const len = Math.hypot(dx, dz) || 1
  c.vx += (dx / len) * power
  c.vz += (dz / len) * power
  c.hp--
  w.events.push({ type: 'hit', x: c.x, z: c.z, hue: c.hue })
  if (c.hp <= 0) eliminate(w, c, by, false)
}

const throwEgg = (w: World, c: Chicken) => {
  const gold = c.gold > 0
  if (gold) c.gold--
  w.eggs.push({
    x: c.x + Math.cos(c.angle) * 0.8,
    z: c.z + Math.sin(c.angle) * 0.8,
    vx: Math.cos(c.angle) * EGG_SPEED,
    vz: Math.sin(c.angle) * EGG_SPEED,
    life: EGG_LIFE,
    owner: c.id,
    gold,
  })
  c.cooldown = c.human ? 0.45 : 1.5 + (1 - c.skill) * 1.2
  w.events.push({ type: 'throw', x: c.x, z: c.z })
}

const think = (w: World, c: Chicken, R: number) => {
  const d = Math.hypot(c.x, c.z)

  let target: Chicken | null = null
  let td = Infinity
  for (const o of w.chickens) {
    if (!o.alive || o === c) continue
    const od = Math.hypot(o.x - c.x, o.z - c.z)
    if (od < td) { td = od; target = o }
  }

  let mx = 0, mz = 0
  if (d > R - 2) {
    mx = -c.x / d; mz = -c.z / d
  } else if (c.gold === 0 && w.pickups.length) {
    let best: Pickup | null = null
    let bd = 7
    for (const p of w.pickups) {
      const pd = Math.hypot(p.x - c.x, p.z - c.z)
      if (pd < bd) { bd = pd; best = p }
    }
    if (best) { mx = best.x - c.x; mz = best.z - c.z }
  }
  if (mx === 0 && mz === 0 && target) {
    const dx = target.x - c.x, dz = target.z - c.z
    const dist = Math.hypot(dx, dz) || 1
    // keep a throwing distance and strafe
    const k = dist > 7 ? 1 : dist < 4 ? -1 : 0
    mx = (dx / dist) * k + (-dz / dist) * 0.7 * (c.id % 2 ? 1 : -1)
    mz = (dz / dist) * k + (dx / dist) * 0.7 * (c.id % 2 ? 1 : -1)
  }
  const ml = Math.hypot(mx, mz) || 1
  c.moveX = mx / ml
  c.moveZ = mz / ml

  if (target) {
    const lead = td / EGG_SPEED
    const tx = target.x + (target.moveX * SPEED + target.vx) * lead * c.skill
    const tz = target.z + (target.moveZ * SPEED + target.vz) * lead * c.skill
    c.angle = Math.atan2(tz - c.z, tx - c.x) + (Math.random() - 0.5) * (1 - c.skill) * 0.9
    c.fire = td < 11
  } else {
    c.fire = false
  }
}

export const step = (
  w: World,
  dt: number,
  input?: { mx: number; mz: number; angle: number; fire: boolean },
) => {
  if (w.over) return
  const R = arenaRadius(w.t)

  for (const c of w.chickens) {
    if (!c.alive) continue

    if (c.falling > 0) {
      c.falling += dt
      c.x += c.vx * dt
      c.z += c.vz * dt
      if (c.falling >= FALL_TIME) eliminate(w, c, null, true)
      continue
    }

    if (c.human) {
      if (input) {
        const l = Math.hypot(input.mx, input.mz) || 1
        c.moveX = input.mx / l * (input.mx || input.mz ? 1 : 0)
        c.moveZ = input.mz / l * (input.mx || input.mz ? 1 : 0)
        c.angle = input.angle
        c.fire = input.fire
      }
    } else {
      c.think -= dt
      if (c.think <= 0) { c.think = 0.12 + Math.random() * 0.1; think(w, c, R) }
    }

    c.x += (c.moveX * SPEED + c.vx) * dt
    c.z += (c.moveZ * SPEED + c.vz) * dt
    const drag = Math.exp(-4 * dt)
    c.vx *= drag
    c.vz *= drag

    c.cooldown -= dt
    if (c.fire && c.cooldown <= 0) throwEgg(w, c)

    if (Math.hypot(c.x, c.z) > R) c.falling = 0.001

    for (let i = w.pickups.length - 1; i >= 0; i--) {
      const p = w.pickups[i]
      if (Math.hypot(p.x - c.x, p.z - c.z) < 1) {
        c.gold = GOLD_SHOTS
        w.pickups.splice(i, 1)
        w.events.push({ type: 'gold', x: c.x, z: c.z })
      }
    }
  }

  // chickens are chunky: push overlapping ones apart
  for (let i = 0; i < w.chickens.length; i++) {
    const a = w.chickens[i]
    if (!a.alive || a.falling > 0) continue
    for (let j = i + 1; j < w.chickens.length; j++) {
      const b = w.chickens[j]
      if (!b.alive || b.falling > 0) continue
      const dx = b.x - a.x, dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      if (d > 0 && d < 1.1) {
        const push = (1.1 - d) / 2
        a.x -= (dx / d) * push; a.z -= (dz / d) * push
        b.x += (dx / d) * push; b.z += (dz / d) * push
      }
    }
  }

  // eggs
  for (let i = w.eggs.length - 1; i >= 0; i--) {
    const e = w.eggs[i]
    e.x += e.vx * dt
    e.z += e.vz * dt
    e.life -= dt
    const owner = w.chickens[e.owner]
    let popped = false

    for (const c of w.chickens) {
      if (!c.alive || c.falling > 0 || c.id === e.owner) continue
      if (Math.hypot(c.x - e.x, c.z - e.z) < HIT_DIST) {
        if (e.gold) {
          w.events.push({ type: 'boom', x: e.x, z: e.z })
          for (const o of w.chickens) {
            if (!o.alive || o.id === e.owner) continue
            const od = Math.hypot(o.x - e.x, o.z - e.z)
            if (od < 2.6) hurt(w, o, owner, o.x - e.x, o.z - e.z, 11)
          }
        } else {
          hurt(w, c, owner, e.vx, e.vz, 5)
        }
        popped = true
        break
      }
    }
    if (!popped && e.life <= 0) {
      w.events.push({ type: 'splat', x: e.x, z: e.z, gold: e.gold })
      if (e.gold) {
        w.events.push({ type: 'boom', x: e.x, z: e.z })
        for (const o of w.chickens) {
          if (!o.alive || o.id === e.owner) continue
          if (Math.hypot(o.x - e.x, o.z - e.z) < 2.6) hurt(w, o, owner, o.x - e.x, o.z - e.z, 11)
        }
      }
      popped = true
    }
    if (popped) w.eggs.splice(i, 1)
  }

  // golden egg drops
  w.pickupTimer -= dt
  if (w.pickupTimer <= 0 && w.pickups.length < 2) {
    w.pickupTimer = 7
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * (R - 2)
    w.pickups.push({ x: Math.cos(a) * r, z: Math.sin(a) * r })
  }

  w.t += dt

  const alive = w.chickens.filter(c => c.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const pool = alive.length ? alive : w.chickens.filter(c => c.place === 1)
    const winner = pool.reduce((a, b) => (b.hp > a.hp || (b.hp === a.hp && b.kills > a.kills) ? b : a))
    winner.place = 1
    winner.alive = true
    winner.falling = 0
    w.winner = winner.id
    w.over = true
    w.chickens
      .filter(c => c.alive && c !== winner)
      .sort((a, b) => b.hp - a.hp || b.kills - a.kills)
      .forEach((c, i) => { c.place = i + 2 })
  }
}
