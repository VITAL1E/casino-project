import { genMap, mulberry32, MAP_R, type Box, type GameMap } from './map'
import { pickSeats } from '../net/seats'

export { MAP_R }
export const ROUND_SEC = 100
export const PLAYERS = 10
export const R_START = 140
export const R_END = 14
const STORM_DELAY = 8
const STORM_END = 92
// nobody can shoot or be hurt while everyone is still landing
export const GRACE = 6
// bots hit a little softer than a person would
const BOT_DAMAGE = 0.65

const RADIUS = 0.45
const HEIGHT = 1.8
const EYE = 1.55
const GRAVITY = 22
const JUMP_V = 7.2
const WALK = 5.2
const RUN = 7.4
const STEP_UP = 0.25
const BUILD_COST = 10
const BUILD_HP = 160

export type WeaponKey = 'pistol' | 'ar' | 'shotgun' | 'sniper'
export const WEAPONS: Record<WeaponKey, { name: string; dmg: number; rate: number; pellets: number; spread: number; range: number }> = {
  pistol:  { name: 'Pistol',        dmg: 18, rate: 0.32, pellets: 1, spread: 0.012, range: 90 },
  ar:      { name: 'Assault Rifle', dmg: 19, rate: 0.11, pellets: 1, spread: 0.028, range: 130 },
  shotgun: { name: 'Shotgun',       dmg: 9,  rate: 0.85, pellets: 9, spread: 0.075, range: 32 },
  sniper:  { name: 'Sniper',        dmg: 88, rate: 1.3,  pellets: 1, spread: 0.002, range: 260 },
}

export type LootKind = WeaponKey | 'shield' | 'med' | 'mats'
export type Loot = { id: number; x: number; z: number; kind: LootKind }

export type Player = {
  id: number
  name: string
  hue: number
  human: boolean
  auto: boolean   // a disconnected human is steered by the bot AI
  x: number; y: number; z: number
  vy: number
  yaw: number
  pitch: number
  moveX: number; moveZ: number
  hp: number
  shield: number
  mats: number
  weapons: WeaponKey[]
  slot: number
  cooldown: number
  buildCd: number
  alive: boolean
  kills: number
  place: number
  fire: boolean
  hurtT: number
  lastShot: number
  // bot brain
  think: number
  target: number
  seen: number
  strafe: number
  strafeT: number
  stuckT: number
  px: number; pz: number
  skill: number
  goalX: number; goalZ: number
  jumpT: number
}

export type GameEvent =
  | { type: 'shot'; from: [number, number, number]; to: [number, number, number]; owner: number; weapon: WeaponKey }
  | { type: 'hit'; x: number; y: number; z: number; dmg: number; head: boolean; owner: number; target: number }
  | { type: 'impact'; x: number; y: number; z: number }
  | { type: 'kill'; killer: number; victim: number; weapon: WeaponKey | 'storm' }
  | { type: 'build'; id: number }
  | { type: 'wallbreak'; x: number; z: number }
  | { type: 'pickup'; id: number; by: number; kind: LootKind }

export type World = {
  t: number
  seed: number
  map: GameMap
  players: Player[]
  loot: Loot[]
  events: GameEvent[]
  lootTimer: number
  lootId: number
  rand: () => number
  over: boolean
  winner: number
}

const NAMES = ['Ghost', 'Rex', 'Nova', 'Vandal', 'Jinx', 'Onyx', 'Blaze', 'Wraith', 'Kestrel']

export const stormRadius = (t: number) =>
  t <= STORM_DELAY ? R_START : R_START + (R_END - R_START) * Math.min(1, (t - STORM_DELAY) / (STORM_END - STORM_DELAY))

const rangeOf = (p: Player) => WEAPONS[p.weapons[p.slot]].range

// The map depends only on `seed` (genMap runs first), so a client can rebuild it from the seed alone.
export const createWorld = (humans: string[], seed = Math.floor(Math.random() * 1e9)): { world: World; seats: number[] } => {
  const rand = mulberry32(seed)
  const map = genMap(rand, PLAYERS)
  const seats = pickSeats(humans.length, PLAYERS)
  let bot = 0
  const players: Player[] = map.spawns.map((s, i) => ({
    id: i,
    name: seats.includes(i) ? humans[seats.indexOf(i)] : NAMES[bot++ % NAMES.length],
    hue: (i * 36 + 10) % 360,
    human: seats.includes(i),
    auto: false,
    x: s.x, y: 0, z: s.z, vy: 0,
    yaw: Math.atan2(-s.z, -s.x), pitch: 0,
    moveX: 0, moveZ: 0,
    hp: 100, shield: 0, mats: 100,
    weapons: ['pistol'], slot: 0,
    cooldown: 0.4, buildCd: 0,
    alive: true, kills: 0, place: 0, fire: false, hurtT: 0, lastShot: -9,
    think: rand() * 0.3, target: -1, seen: 0, strafe: rand() < 0.5 ? 1 : -1, strafeT: 1,
    stuckT: 0, px: s.x, pz: s.z, skill: 0.5 + rand() * 0.5, goalX: 0, goalZ: 0, jumpT: 0,
  }))

  const w: World = { t: 0, seed, map, players, loot: [], events: [], lootTimer: 6, lootId: 1, rand, over: false, winner: -1 }

  const kinds: LootKind[] = [
    ...Array(14).fill('ar'), ...Array(9).fill('shotgun'), ...Array(5).fill('sniper'),
    ...Array(11).fill('shield'), ...Array(9).fill('med'), ...Array(8).fill('mats'),
  ]
  const spots = [...map.lootSpots].sort(() => rand() - 0.5)
  kinds.forEach((k, i) => {
    const s = spots[i % spots.length]
    w.loot.push({ id: w.lootId++, x: s.x + (rand() - 0.5) * 1.5, z: s.z + (rand() - 0.5) * 1.5, kind: k })
  })
  return { world: w, seats }
}

// ---------- geometry ----------
export type RayHit = { t: number; kind: 'player' | 'box'; id: number; x: number; y: number; z: number; head: boolean }

export const rayCast = (
  w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, ignore = -1,
): RayHit | null => {
  let best: RayHit | null = null

  for (const p of w.players) {
    if (!p.alive || p.id === ignore) continue
    const fx = ox - p.x, fz = oz - p.z
    const a = dx * dx + dz * dz
    if (a < 1e-6) continue
    const b = 2 * (fx * dx + fz * dz)
    const c = fx * fx + fz * fz - RADIUS * RADIUS
    const disc = b * b - 4 * a * c
    if (disc < 0) continue
    const t = (-b - Math.sqrt(disc)) / (2 * a)
    if (t < 0 || t > range || (best && t >= best.t)) continue
    const y = oy + dy * t
    if (y < p.y || y > p.y + HEIGHT) continue
    best = { t, kind: 'player', id: p.id, x: ox + dx * t, y, z: oz + dz * t, head: y > p.y + 1.42 }
  }

  for (const bx of w.map.boxes) {
    const hx = bx.w / 2, hz = bx.d / 2
    let t0 = 0, t1 = best ? best.t : range
    const slab = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi
      let a = (lo - o) / d, b = (hi - o) / d
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a); t1 = Math.min(t1, b)
      return t0 <= t1
    }
    if (!slab(ox, dx, bx.x - hx, bx.x + hx) || !slab(oy, dy, 0, bx.h) || !slab(oz, dz, bx.z - hz, bx.z + hz)) continue
    if (t0 > 0 && (!best || t0 < best.t)) best = { t: t0, kind: 'box', id: bx.id, x: ox + dx * t0, y: oy + dy * t0, z: oz + dz * t0, head: false }
  }
  return best
}

const groundAt = (w: World, p: Player) => {
  let g = 0
  for (const b of w.map.boxes) {
    if (Math.abs(p.x - b.x) <= b.w / 2 + 0.1 && Math.abs(p.z - b.z) <= b.d / 2 + 0.1 && p.y >= b.h - STEP_UP) g = Math.max(g, b.h)
  }
  return g
}

const resolveBoxes = (w: World, p: Player) => {
  for (let it = 0; it < 2; it++) {
    for (const b of w.map.boxes) {
      if (p.y >= b.h - STEP_UP) continue
      const nx = Math.max(b.x - b.w / 2, Math.min(p.x, b.x + b.w / 2))
      const nz = Math.max(b.z - b.d / 2, Math.min(p.z, b.z + b.d / 2))
      const dx = p.x - nx, dz = p.z - nz
      const d2 = dx * dx + dz * dz
      if (d2 >= RADIUS * RADIUS) continue
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        p.x += (dx / d) * (RADIUS - d); p.z += (dz / d) * (RADIUS - d)
      } else {
        const px = b.w / 2 - Math.abs(p.x - b.x), pz = b.d / 2 - Math.abs(p.z - b.z)
        if (px < pz) p.x += Math.sign(p.x - b.x || 1) * (px + RADIUS)
        else p.z += Math.sign(p.z - b.z || 1) * (pz + RADIUS)
      }
    }
  }
  const r = Math.hypot(p.x, p.z)
  if (r > MAP_R + 8) { p.x *= (MAP_R + 8) / r; p.z *= (MAP_R + 8) / r }
}

// ---------- actions ----------
const eliminate = (w: World, victim: Player, killer: Player | null, weapon: WeaponKey | 'storm') => {
  if (!victim.alive) return
  victim.alive = false
  victim.fire = false
  victim.place = w.players.filter(p => p.alive).length + 1
  if (killer && killer !== victim) killer.kills++
  w.events.push({ type: 'kill', killer: killer ? killer.id : -1, victim: victim.id, weapon })
}

const damage = (w: World, target: Player, owner: Player, amount: number, head: boolean, at: { x: number; y: number; z: number }, weapon: WeaponKey) => {
  if (!target.alive || w.t < GRACE) return
  let left = owner.human ? amount : amount * BOT_DAMAGE
  const soak = Math.min(target.shield, left)
  target.shield -= soak
  left -= soak
  target.hp -= left
  target.hurtT = 1.5
  w.events.push({ type: 'hit', x: at.x, y: at.y, z: at.z, dmg: Math.round(amount), head, owner: owner.id, target: target.id })
  if (target.hp <= 0) { target.hp = 0; eliminate(w, target, owner, weapon) }
}

export const eyeOf = (p: Player): [number, number, number] => [p.x, p.y + EYE, p.z]

const fireWeapon = (w: World, p: Player, aim: [number, number, number]) => {
  const key = p.weapons[p.slot]
  const wp = WEAPONS[key]
  p.cooldown = wp.rate
  p.lastShot = w.t
  const [ox, oy, oz] = eyeOf(p)
  const len = Math.hypot(...aim) || 1
  const base: [number, number, number] = [aim[0] / len, aim[1] / len, aim[2] / len]

  for (let i = 0; i < wp.pellets; i++) {
    // random direction inside a cone around the aim
    const s = wp.spread
    let dx = base[0] + (w.rand() - 0.5) * 2 * s
    let dy = base[1] + (w.rand() - 0.5) * 2 * s
    let dz = base[2] + (w.rand() - 0.5) * 2 * s
    const l = Math.hypot(dx, dy, dz)
    dx /= l; dy /= l; dz /= l
    const hit = rayCast(w, ox, oy, oz, dx, dy, dz, wp.range, p.id)
    const t = hit ? hit.t : wp.range
    w.events.push({ type: 'shot', from: [ox + dx * 0.7, oy - 0.25 + dy * 0.7, oz + dz * 0.7], to: [ox + dx * t, oy + dy * t, oz + dz * t], owner: p.id, weapon: key })
    if (!hit) continue

    const fall = 1 - 0.5 * (hit.t / wp.range)
    if (hit.kind === 'player') {
      const dmg = wp.dmg * fall * (hit.head ? (key === 'sniper' ? 2.2 : 1.6) : 1)
      damage(w, w.players[hit.id], p, dmg, hit.head, hit, key)
    } else {
      const bx = w.map.boxes.find(b => b.id === hit.id)
      w.events.push({ type: 'impact', x: hit.x, y: hit.y, z: hit.z })
      if (bx && bx.kind === 'build') {
        bx.hp -= wp.dmg * fall * 1.1
        if (bx.hp <= 0) {
          w.map.boxes.splice(w.map.boxes.indexOf(bx), 1)
          w.events.push({ type: 'wallbreak', x: bx.x, z: bx.z })
        }
      }
    }
  }
}

const tryBuild = (w: World, p: Player, yaw = p.yaw) => {
  if (p.mats < BUILD_COST || p.buildCd > 0) return false
  const fx = Math.cos(yaw), fz = Math.sin(yaw)
  const alongZ = Math.abs(fx) > Math.abs(fz)
  const x = Math.round(p.x + fx * 3.2), z = Math.round(p.z + fz * 3.2)
  const bw = alongZ ? 0.5 : 5, bd = alongZ ? 5 : 0.5
  const blocked = (ax: number, az: number, aw: number, ad: number) =>
    Math.abs(x - ax) < (bw + aw) / 2 && Math.abs(z - az) < (bd + ad) / 2
  if (w.map.boxes.some(b => (b.kind === 'build' || b.kind === 'wall') && blocked(b.x, b.z, b.w, b.d))) return false
  for (const o of w.players) {
    if (!o.alive) continue
    const nx = Math.max(x - bw / 2, Math.min(o.x, x + bw / 2)), nz = Math.max(z - bd / 2, Math.min(o.z, z + bd / 2))
    if (Math.hypot(o.x - nx, o.z - nz) < RADIUS + 0.2) return false
  }
  const box: Box = { id: w.map.nextId++, kind: 'build', x, z, w: bw, d: bd, h: 3.2, hp: BUILD_HP, owner: p.id, born: w.t }
  w.map.boxes.push(box)
  p.mats -= BUILD_COST
  p.buildCd = 0.35
  w.events.push({ type: 'build', id: box.id })
  return true
}

const switchTo = (p: Player, slot: number) => { if (slot >= 0 && slot < p.weapons.length) p.slot = slot }

// ---------- bots ----------
const visible = (w: World, p: Player, o: Player) => {
  const [ox, oy, oz] = eyeOf(p)
  const tx = o.x - ox, ty = o.y + 1.2 - oy, tz = o.z - oz
  const d = Math.hypot(tx, ty, tz)
  const hit = rayCast(w, ox, oy, oz, tx / d, ty / d, tz / d, d + 1, p.id)
  return !!hit && hit.kind === 'player' && hit.id === o.id
}

const brain = (w: World, p: Player, dt: number) => {
  p.think -= dt
  if (p.think > 0) return
  p.think = 0.12 + w.rand() * 0.06
  const R = stormRadius(w.t)
  const dc = Math.hypot(p.x, p.z)

  // pick / keep a target we can see
  let target: Player | null = null
  const sight = p.weapons[p.slot] === 'sniper' ? 110 : p.weapons[p.slot] === 'ar' ? 60 : 45
  let best = sight
  for (const o of w.players) {
    if (!o.alive || o === p) continue
    const d = Math.hypot(o.x - p.x, o.z - p.z)
    if (d < best && visible(w, p, o)) { best = d; target = o }
  }
  if (target) { p.seen = p.target === target.id ? p.seen + 0.15 : 0; p.target = target.id }
  else { p.target = -1; p.seen = 0 }

  p.strafeT -= 0.15
  if (p.strafeT <= 0) { p.strafe = -p.strafe; p.strafeT = 0.6 + w.rand() * 1.2 }

  let gx: number, gz: number
  if (dc > R - 12) {
    gx = -p.x; gz = -p.z
  } else if (target) {
    const dx = target.x - p.x, dz = target.z - p.z
    const D = Math.hypot(dx, dz) || 1
    const want = p.weapons[p.slot] === 'shotgun' ? 7 : p.weapons[p.slot] === 'sniper' ? 55 : p.weapons[p.slot] === 'ar' ? 20 : 14
    const k = D > want + 6 ? 1 : D < want - 5 ? -1 : 0
    gx = (dx / D) * k + (-dz / D) * 0.8 * p.strafe
    gz = (dz / D) * k + (dx / D) * 0.8 * p.strafe
  } else {
    // loot first, then drift toward the safe zone
    let lootT: Loot | null = null
    let ld = 70
    for (const l of w.loot) {
      const d = Math.hypot(l.x - p.x, l.z - p.z)
      const wanted = l.kind === 'shield' ? p.shield < 60 : l.kind === 'med' ? p.hp < 80 : l.kind === 'mats' ? p.mats < 120 : !p.weapons.includes(l.kind as WeaponKey)
      if (wanted && d < ld) { ld = d; lootT = l }
    }
    if (lootT) { gx = lootT.x - p.x; gz = lootT.z - p.z }
    else {
      if (Math.hypot(p.goalX - p.x, p.goalZ - p.z) < 3 || Math.hypot(p.goalX, p.goalZ) > R * 0.8) {
        const a = w.rand() * Math.PI * 2, r = Math.sqrt(w.rand()) * R * 0.6
        p.goalX = Math.cos(a) * r; p.goalZ = Math.sin(a) * r
      }
      gx = p.goalX - p.x; gz = p.goalZ - p.z
    }
  }

  let gl = Math.hypot(gx, gz)
  if (gl > 0.01) {
    let ang = Math.atan2(gz, gx)
    // look ahead and steer round walls
    const probe = (a: number) => {
      const h = rayCast(w, p.x, p.y + 0.8, p.z, Math.cos(a), 0, Math.sin(a), 2.6, p.id)
      return !!h && h.kind === 'box'
    }
    if (probe(ang)) {
      for (const off of [0.8, -0.8, 1.6, -1.6, 2.4]) if (!probe(ang + off)) { ang += off; break }
    }
    p.moveX = Math.cos(ang); p.moveZ = Math.sin(ang)
    gl = 1
  } else { p.moveX = 0; p.moveZ = 0 }

  // stuck: hop and side-step
  const moved = Math.hypot(p.x - p.px, p.z - p.pz)
  p.px = p.x; p.pz = p.z
  if (gl > 0 && moved < 0.25) p.stuckT += 0.15
  else p.stuckT = 0
  if (p.stuckT > 0.6) { p.jumpT = 0.3; p.stuckT = 0; p.strafe = -p.strafe }

  // aim and shoot
  if (target) {
    const [ox, oy, oz] = eyeOf(p)
    const tx = target.x - ox, tz = target.z - oz
    const D = Math.hypot(tx, tz) || 1
    const noise = (0.2 - 0.12 * p.skill) * Math.max(0.4, 1 - p.seen * 0.12)
    p.yaw = Math.atan2(tz, tx) + (w.rand() - 0.5) * noise
    p.pitch = Math.atan2(target.y + 1.2 - oy, D) + (w.rand() - 0.5) * noise * 0.5
    p.fire = w.t > GRACE && p.seen > 0.7 * (1.2 - p.skill) + 0.35 && D < rangeOf(p)
    // best weapon for the range
    const has = (k: WeaponKey) => p.weapons.indexOf(k)
    if (D < 12 && has('shotgun') >= 0) switchTo(p, has('shotgun'))
    else if (D > 70 && has('sniper') >= 0) switchTo(p, has('sniper'))
    else if (has('ar') >= 0) switchTo(p, has('ar'))
    else if (has('shotgun') >= 0 && D < 20) switchTo(p, has('shotgun'))
    else switchTo(p, 0)
    if (p.hurtT > 0 && D > 6 && p.mats >= BUILD_COST && w.rand() < 0.5) tryBuild(w, p, p.yaw)
  } else {
    p.fire = false
    if (gl > 0) p.yaw = Math.atan2(p.moveZ, p.moveX)
  }
}

// ---------- main step ----------
export type Input = {
  mx: number; mz: number            // world-space move direction (unit or 0)
  yaw: number; pitch: number
  aim?: [number, number, number]    // unit direction the shot should follow
  fire: boolean; jump: boolean; sprint: boolean; build: boolean
  slot?: number
}

// `inputs` is indexed by player id; a human with no entry keeps its last input.
export const step = (w: World, dt: number, inputs: (Input | undefined)[] = []) => {
  if (w.over) return
  const R = stormRadius(w.t)

  for (const p of w.players) {
    if (!p.alive) continue
    let jump = false, sprint = false, aim: [number, number, number] | undefined

    if (p.human && !p.auto) {
      const input = inputs[p.id]
      if (input) {
        p.moveX = input.mx; p.moveZ = input.mz
        p.yaw = input.yaw; p.pitch = input.pitch
        p.fire = input.fire; jump = input.jump; sprint = input.sprint; aim = input.aim
        if (input.slot !== undefined) switchTo(p, input.slot)
        if (input.build) tryBuild(w, p)
      }
    } else {
      brain(w, p, dt)
      p.jumpT -= dt
      jump = p.jumpT > 0
      sprint = p.target < 0
    }

    p.cooldown -= dt; p.buildCd -= dt; p.hurtT -= dt

    // movement
    const sp = sprint ? RUN : WALK
    const ml = Math.hypot(p.moveX, p.moveZ)
    if (ml > 0.01) { p.x += (p.moveX / ml) * sp * dt; p.z += (p.moveZ / ml) * sp * dt }
    const floor = groundAt(w, p)
    if (jump && p.y <= floor + 0.02) p.vy = JUMP_V
    p.vy -= GRAVITY * dt
    p.y += p.vy * dt
    resolveBoxes(w, p)
    const g2 = groundAt(w, p)
    if (p.y <= g2) { p.y = g2; p.vy = 0 }

    // shoot
    if (p.fire && p.cooldown <= 0) {
      const a = aim ?? [Math.cos(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.sin(p.yaw) * Math.cos(p.pitch)] as [number, number, number]
      fireWeapon(w, p, a)
    }

    // storm
    if (Math.hypot(p.x, p.z) > R && w.t > STORM_DELAY) {
      p.hp -= (1.5 + 5 * (w.t / ROUND_SEC)) * dt
      if (p.hp <= 0) { p.hp = 0; eliminate(w, p, null, 'storm') }
    }

    // loot
    for (let i = w.loot.length - 1; i >= 0; i--) {
      const l = w.loot[i]
      if (Math.hypot(l.x - p.x, l.z - p.z) > 1.3 || !p.alive) continue
      let take = false
      if (l.kind === 'shield') { if (p.shield < 100) { p.shield = Math.min(100, p.shield + 50); take = true } }
      else if (l.kind === 'med') { if (p.hp < 100) { p.hp = Math.min(100, p.hp + 35); take = true } }
      else if (l.kind === 'mats') { if (p.mats < 300) { p.mats = Math.min(300, p.mats + 60); take = true } }
      else if (!p.weapons.includes(l.kind) && p.weapons.length < 4) {
        p.weapons.push(l.kind)
        if (p.human) p.slot = p.weapons.length - 1
        take = true
      }
      if (take) {
        w.events.push({ type: 'pickup', id: l.id, by: p.id, kind: l.kind })
        w.loot.splice(i, 1)
      }
    }
    if (p.mats < 300) p.mats = Math.min(300, p.mats + 2.5 * dt)
  }

  w.lootTimer -= dt
  if (w.lootTimer <= 0 && w.loot.length < 60) {
    w.lootTimer = 10
    const a = w.rand() * Math.PI * 2, r = Math.sqrt(w.rand()) * R * 0.85
    const kinds: LootKind[] = ['ar', 'shotgun', 'shield', 'med', 'mats', 'sniper']
    w.loot.push({ id: w.lootId++, x: Math.cos(a) * r, z: Math.sin(a) * r, kind: kinds[Math.floor(w.rand() * kinds.length)] })
  }

  w.t += dt

  const alive = w.players.filter(p => p.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const ranked = (alive.length ? alive : w.players.filter(p => p.place === 1))
      .sort((a, b) => (b.hp + b.shield) - (a.hp + a.shield) || b.kills - a.kills)
    ranked.forEach((p, i) => { p.place = i + 1 })
    ranked[0].alive = true
    w.winner = ranked[0].id
    w.over = true
    // anyone still standing behind the winner
    w.players.filter(p => p.alive && p !== ranked[0]).forEach((p, i) => { p.place = i + 2 })
  }
}
