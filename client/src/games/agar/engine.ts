export const ROUND_SEC = 60
export const PLAYERS = 10
export const R_START = 1300
export const R_END = 200

const START_MASS = 20
const FOOD_TARGET = 300

export type Pt = { x: number; y: number }
export type Food = Pt & { v: number; hue: number }

export type Cell = {
  id: number
  name: string
  hue: number
  human: boolean
  x: number
  y: number
  want: number
  mass: number
  hp: number
  alive: boolean
  kills: number
  place: number
  aggr: number
  think: number
}

export type World = {
  t: number
  cells: Cell[]
  food: Food[]
  over: boolean
  winner: number
}

const BOT_NAMES = ['Blob', 'Munch', 'Chomp', 'Gulp', 'Nibbles', 'Orbit', 'Pac', 'Goo', 'Bubble']

export const zoneRadius = (t: number) => R_START + (R_END - R_START) * Math.min(t / ROUND_SEC, 1)
export const radiusOf = (c: Cell) => Math.sqrt(c.mass) * 3
const speedOf = (c: Cell) => Math.max(70, 230 - radiusOf(c) * 1.6)

const spawnFood = (w: World) => {
  const r = zoneRadius(w.t) * 0.95 * Math.sqrt(Math.random())
  const a = Math.random() * Math.PI * 2
  w.food.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, v: 1, hue: Math.random() * 360 })
}

export const createWorld = (): World => {
  const humanSlot = Math.floor(Math.random() * PLAYERS)
  let bot = 0
  const cells: Cell[] = Array.from({ length: PLAYERS }, (_, i) => {
    const a = (i / PLAYERS) * Math.PI * 2
    const human = i === humanSlot
    return {
      id: i,
      name: human ? 'You' : BOT_NAMES[bot++],
      hue: (i * 36 + 200) % 360,
      human,
      x: Math.cos(a) * 900,
      y: Math.sin(a) * 900,
      want: a + Math.PI,
      mass: START_MASS,
      hp: 100,
      alive: true,
      kills: 0,
      place: 0,
      aggr: Math.random(),
      think: Math.random() * 0.2,
    }
  })
  const w: World = { t: 0, cells, food: [], over: false, winner: -1 }
  for (let i = 0; i < FOOD_TARGET; i++) spawnFood(w)
  return w
}

const aliveCount = (w: World) => w.cells.reduce((n, c) => n + (c.alive ? 1 : 0), 0)

const kill = (w: World, c: Cell, by: Cell | null) => {
  if (!c.alive) return
  c.alive = false
  c.place = aliveCount(w) + 1
  if (by) {
    by.kills++
    by.mass += c.mass * 0.8
  } else {
    // melted outside the zone: mass scatters as pellets
    const r = radiusOf(c)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      w.food.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, v: c.mass / 8, hue: c.hue })
    }
  }
}

const think = (w: World, c: Cell) => {
  const R = zoneRadius(w.t)
  const d = Math.hypot(c.x, c.y)
  const rc = radiusOf(c)

  if (d > R - 110) { c.want = Math.atan2(-c.y, -c.x); return }

  // flee from anything that can eat us
  let fx = 0, fy = 0, threat = false
  for (const o of w.cells) {
    if (!o.alive || o === c || o.mass < c.mass * 1.15) continue
    const od = Math.hypot(o.x - c.x, o.y - c.y)
    if (od < rc + radiusOf(o) + 220) {
      fx += (c.x - o.x) / od
      fy += (c.y - o.y) / od
      threat = true
    }
  }
  if (threat) { c.want = Math.atan2(fy, fx); return }

  // hunt smaller cells
  if (c.aggr > 0.35) {
    let prey: Cell | null = null
    let pd = 380
    for (const o of w.cells) {
      if (!o.alive || o === c || c.mass < o.mass * 1.15) continue
      const od = Math.hypot(o.x - c.x, o.y - c.y)
      if (od < pd) { pd = od; prey = o }
    }
    if (prey) { c.want = Math.atan2(prey.y - c.y, prey.x - c.x); return }
  }

  let best: Food | null = null
  let bd = 420
  for (const f of w.food) {
    const fd = Math.hypot(f.x - c.x, f.y - c.y) / f.v
    if (fd < bd) { bd = fd; best = f }
  }
  c.want = best ? Math.atan2(best.y - c.y, best.x - c.x) : c.want + (Math.random() - 0.5)
}

export const step = (w: World, dt: number, humanWant?: number) => {
  if (w.over) return
  const R = zoneRadius(w.t)
  const eaten: { c: Cell; by: Cell | null }[] = []

  for (const c of w.cells) {
    if (!c.alive) continue

    if (c.human) {
      if (humanWant !== undefined) c.want = humanWant
    } else {
      c.think -= dt
      if (c.think <= 0) { c.think = 0.1 + Math.random() * 0.1; think(w, c) }
    }

    const sp = speedOf(c)
    c.x += Math.cos(c.want) * sp * dt
    c.y += Math.sin(c.want) * sp * dt
    if (c.mass > 30) c.mass -= c.mass * 0.01 * dt

    const d = Math.hypot(c.x, c.y)
    if (d > R) {
      c.hp -= (35 + (d - R) * 0.12) * dt
      if (c.hp <= 0) { c.hp = 0; eaten.push({ c, by: null }); continue }
    }

    const r = radiusOf(c)
    for (let i = w.food.length - 1; i >= 0; i--) {
      const f = w.food[i]
      if (Math.hypot(f.x - c.x, f.y - c.y) < r) {
        c.mass += f.v
        w.food[i] = w.food[w.food.length - 1]
        w.food.pop()
      }
    }
  }

  for (const a of w.cells) {
    if (!a.alive) continue
    for (const b of w.cells) {
      if (!b.alive || a === b || a.mass < b.mass * 1.15) continue
      if (eaten.some(e => e.c === b)) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) < radiusOf(a) - radiusOf(b) * 0.5) eaten.push({ c: b, by: a })
    }
  }
  for (const { c, by } of eaten) kill(w, c, by)

  w.t += dt
  while (w.food.length < FOOD_TARGET) spawnFood(w)

  const alive = w.cells.filter(c => c.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const pool = alive.length ? alive : w.cells.filter(c => c.place === 1)
    const winner = pool.reduce((a, b) => (b.mass > a.mass ? b : a))
    winner.place = 1
    winner.alive = true
    w.winner = winner.id
    w.over = true
    w.cells
      .filter(c => c.alive && c !== winner)
      .sort((a, b) => b.mass - a.mass)
      .forEach((c, i) => { c.place = i + 2 })
  }
}
