export const ROUND_SEC = 60
export const PLAYERS = 10
export const R_START = 1300
export const R_END = 200
export const TICK = 1 / 60           // fixed step used everywhere the round is simulated
export const MAX_TICKS = Math.ceil(ROUND_SEC / TICK) + 60   // hard cap, generous slack

// small seeded PRNG so a round replays identically from its seed + recorded inputs
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEG = 5
const TURN = 3.6
const SPEED = 140
const BOOST_SPEED = 240
const START_LEN = 100
const MIN_BOOST_LEN = 60
const FOOD_TARGET = 240

export type Pt = { x: number; y: number }
export type Food = Pt & { v: number; hue: number }

export type Snake = {
  id: number
  name: string
  hue: number
  human: boolean
  x: number
  y: number
  angle: number
  want: number
  boost: boolean
  len: number
  hp: number
  alive: boolean
  body: Pt[]
  kills: number
  place: number
  aggr: number
  think: number
  drip: number
}

export type World = {
  t: number
  tick: number
  snakes: Snake[]
  food: Food[]
  over: boolean
  winner: number
  rand: () => number
}

const BOT_NAMES = ['Viper', 'Noodle', 'Cobra', 'Slinky', 'Mamba', 'Python', 'Adder', 'Rattler', 'Sidewinder']

export const zoneRadius = (t: number) => R_START + (R_END - R_START) * Math.min(t / ROUND_SEC, 1)
export const radiusOf = (s: Snake) => 7 + Math.min(s.len / 120, 7)

const norm = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

const spawnFood = (w: World) => {
  const r = zoneRadius(w.t) * 0.95 * Math.sqrt(w.rand())
  const a = w.rand() * Math.PI * 2
  w.food.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, v: 3 + w.rand() * 3, hue: w.rand() * 360 })
}

// seed fully determines the round: bot names/order, humanSlot, food layout, bot "personality"
// and every bot decision. Same seed + same recorded human inputs => same outcome, always.
export const createWorld = (seed: number): World => {
  const rand = mulberry32(seed)
  const humanSlot = Math.floor(rand() * PLAYERS)
  let bot = 0
  const snakes: Snake[] = Array.from({ length: PLAYERS }, (_, i) => {
    const a = (i / PLAYERS) * Math.PI * 2
    const human = i === humanSlot
    const x = Math.cos(a) * 900
    const y = Math.sin(a) * 900
    const angle = a + Math.PI
    return {
      id: i,
      name: human ? 'You' : BOT_NAMES[bot++],
      hue: (i * 36 + 200) % 360,
      human,
      x, y, angle, want: angle,
      boost: false,
      len: START_LEN,
      hp: 100,
      alive: true,
      body: [{ x, y }],
      kills: 0,
      place: 0,
      aggr: rand(),
      think: rand() * 0.2,
      drip: 0,
    }
  })
  const w: World = { t: 0, tick: 0, snakes, food: [], over: false, winner: -1, rand }
  for (let i = 0; i < FOOD_TARGET; i++) spawnFood(w)
  return w
}

const aliveCount = (w: World) => w.snakes.reduce((n, s) => n + (s.alive ? 1 : 0), 0)

const kill = (w: World, s: Snake, by: Snake | null) => {
  if (!s.alive) return
  s.alive = false
  s.boost = false
  s.place = aliveCount(w) + 1
  if (by && by !== s) by.kills++
  for (let i = 0; i < s.body.length; i += 2) {
    const p = s.body[i]
    w.food.push({ x: p.x, y: p.y, v: 6, hue: s.hue })
  }
}

const blockedAt = (w: World, me: Snake, x: number, y: number) => {
  const r = radiusOf(me)
  for (const o of w.snakes) {
    if (!o.alive) continue
    const or = radiusOf(o) * 0.8
    const start = o === me ? 10 : 0
    if (o !== me && Math.hypot(x - o.x, y - o.y) < r + or + 4) return true
    for (let i = start; i < o.body.length; i++) {
      const p = o.body[i]
      if (Math.abs(p.x - x) < r + or + 4 && Math.abs(p.y - y) < r + or + 4) return true
    }
  }
  return false
}

const think = (w: World, s: Snake) => {
  const R = zoneRadius(w.t)
  const d = Math.hypot(s.x, s.y)
  let target: number

  if (d > R - 110) {
    target = Math.atan2(-s.y, -s.x)
  } else {
    let best: Food | null = null
    let bd = Infinity
    for (const f of w.food) {
      const fd = Math.hypot(f.x - s.x, f.y - s.y)
      if (fd < bd && fd < 420) { bd = fd; best = f }
    }
    if (best) target = Math.atan2(best.y - s.y, best.x - s.x)
    else target = s.angle + (w.rand() - 0.5) * 1.2

    if (s.aggr > 0.55) {
      for (const o of w.snakes) {
        if (!o.alive || o === s || o.len > s.len * 1.25) continue
        const od = Math.hypot(o.x - s.x, o.y - s.y)
        if (od < 300) {
          target = Math.atan2(o.y + Math.sin(o.angle) * 110 - s.y, o.x + Math.cos(o.angle) * 110 - s.x)
          break
        }
      }
    }
  }

  for (const off of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
    const a = target + off
    let clear = true
    for (const look of [28, 60, 95]) {
      if (blockedAt(w, s, s.x + Math.cos(a) * look, s.y + Math.sin(a) * look)) { clear = false; break }
    }
    if (clear) { target = a; break }
  }
  s.want = target
}

export const step = (w: World, dt: number, humanWant?: number, humanBoost?: boolean) => {
  if (w.over) return
  const R = zoneRadius(w.t)
  const dead: { s: Snake; by: Snake | null }[] = []

  for (const s of w.snakes) {
    if (!s.alive) continue

    if (s.human) {
      if (humanWant !== undefined) s.want = humanWant
      s.boost = !!humanBoost
    } else {
      s.think -= dt
      if (s.think <= 0) { s.think = 0.1 + w.rand() * 0.1; think(w, s) }
    }

    const diff = norm(s.want - s.angle)
    s.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff))

    const boosting = s.boost && s.len > MIN_BOOST_LEN
    const speed = boosting ? BOOST_SPEED : SPEED
    if (boosting) {
      s.len -= 18 * dt
      s.drip += dt
      if (s.drip > 0.25 && s.body.length) {
        s.drip = 0
        const tail = s.body[s.body.length - 1]
        w.food.push({ x: tail.x, y: tail.y, v: 3, hue: s.hue })
      }
    }
    s.x += Math.cos(s.angle) * speed * dt
    s.y += Math.sin(s.angle) * speed * dt

    const head = s.body[0]
    if (!head || Math.hypot(s.x - head.x, s.y - head.y) >= SEG) s.body.unshift({ x: s.x, y: s.y })
    const maxPts = Math.ceil(s.len / SEG)
    while (s.body.length > maxPts) s.body.pop()

    // out of the safe zone: health melts, faster the further out
    const d = Math.hypot(s.x, s.y)
    if (d > R) {
      s.hp -= (35 + (d - R) * 0.12) * dt
      if (s.hp <= 0) { s.hp = 0; dead.push({ s, by: null }); continue }
    }

    const r = radiusOf(s)
    for (let i = w.food.length - 1; i >= 0; i--) {
      const f = w.food[i]
      if (Math.hypot(f.x - s.x, f.y - s.y) < r + 8) {
        s.len += f.v
        w.food[i] = w.food[w.food.length - 1]
        w.food.pop()
      }
    }

    for (const o of w.snakes) {
      if (!o.alive || o === s) continue
      const reach = o.body.length * SEG + 60
      if (Math.abs(o.x - s.x) > reach || Math.abs(o.y - s.y) > reach) continue
      const hit = r * 0.9 + radiusOf(o) * 0.8
      let crashed = Math.hypot(o.x - s.x, o.y - s.y) < hit
      for (let i = 0; !crashed && i < o.body.length; i++) {
        const p = o.body[i]
        if (Math.abs(p.x - s.x) < hit && Math.abs(p.y - s.y) < hit && Math.hypot(p.x - s.x, p.y - s.y) < hit) crashed = true
      }
      if (crashed) { dead.push({ s, by: o }); break }
    }
  }

  for (const { s, by } of dead) kill(w, s, by)

  w.t += dt
  w.tick++
  while (w.food.length < FOOD_TARGET) spawnFood(w)

  const alive = w.snakes.filter(s => s.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const pool = alive.length ? alive : w.snakes.filter(s => s.place === 1)
    const winner = pool.reduce((a, b) => (b.len > a.len ? b : a))
    w.winner = winner.id
    winner.place = 1
    winner.alive = true
    w.snakes
      .filter(s => s.alive && s !== winner)
      .sort((a, b) => b.len - a.len)
      .forEach((s, i) => { s.place = i + 2 })
    w.over = true
  }
}
