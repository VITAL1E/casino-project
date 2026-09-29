export const ROUND_SEC = 60
export const PLAYERS = 10
export const WORLD = 800

export type Kind = 'coin' | 'tree' | 'car' | 'house' | 'tower'
export type Thing = { x: number; y: number; r: number; kind: Kind; hue: number }
export type Sucked = Thing & { t: number; tx: number; ty: number; hole: number }

export type Hole = {
  id: number
  name: string
  hue: number
  human: boolean
  x: number
  y: number
  area: number
  want: number
  alive: boolean
  kills: number
  place: number
  aggr: number
  think: number
}

export type World = {
  t: number
  holes: Hole[]
  things: Thing[]
  sucked: Sucked[]
  respawn: number
  over: boolean
  winner: number
}

const NAMES = ['Void', 'Abyss', 'Gulper', 'Vortex', 'Singularity', 'Maw', 'Sinkhole', 'Nova', 'Pit']

const SIZES: Record<Kind, { r: number; count: number }> = {
  coin:  { r: 5,  count: 110 },
  tree:  { r: 11, count: 70 },
  car:   { r: 16, count: 70 },
  house: { r: 28, count: 40 },
  tower: { r: 50, count: 14 },
}
const HUES: Record<Kind, () => number> = {
  coin: () => 48,
  tree: () => 130,
  car: () => Math.random() * 360,
  house: () => 15 + Math.random() * 40,
  tower: () => 200 + Math.random() * 30,
}

export const radiusOf = (h: Hole) => Math.sqrt(h.area)
const speedOf = (h: Hole) => Math.max(95, 210 - radiusOf(h) * 0.9)

const spawn = (kind: Kind): Thing => {
  const size = SIZES[kind].r
  return {
    x: (Math.random() * 2 - 1) * (WORLD - size),
    y: (Math.random() * 2 - 1) * (WORLD - size),
    r: size * (0.85 + Math.random() * 0.3),
    kind,
    hue: HUES[kind](),
  }
}

export const createWorld = (): World => {
  const humanSlot = Math.floor(Math.random() * PLAYERS)
  let bot = 0
  const holes: Hole[] = Array.from({ length: PLAYERS }, (_, i) => {
    const a = (i / PLAYERS) * Math.PI * 2
    const human = i === humanSlot
    return {
      id: i,
      name: human ? 'You' : NAMES[bot++],
      hue: (i * 36 + 200) % 360,
      human,
      x: Math.cos(a) * 560,
      y: Math.sin(a) * 560,
      area: 22 * 22,
      want: a + Math.PI,
      alive: true,
      kills: 0,
      place: 0,
      aggr: Math.random(),
      think: Math.random() * 0.2,
    }
  })
  const things: Thing[] = []
  for (const k of Object.keys(SIZES) as Kind[]) {
    for (let i = 0; i < SIZES[k].count; i++) {
      const t = spawn(k)
      // keep the spawn ring clear
      if (holes.every(h => Math.hypot(h.x - t.x, h.y - t.y) > 60 + t.r)) things.push(t)
    }
  }
  return { t: 0, holes, things, sucked: [], respawn: 0, over: false, winner: -1 }
}

const aliveCount = (w: World) => w.holes.reduce((n, h) => n + (h.alive ? 1 : 0), 0)

const think = (w: World, h: Hole) => {
  const r = radiusOf(h)

  let fx = 0, fy = 0, threat = false
  for (const o of w.holes) {
    if (!o.alive || o === h || radiusOf(o) < r * 1.15) continue
    const d = Math.hypot(o.x - h.x, o.y - h.y)
    if (d < radiusOf(o) + r + 200) { fx += (h.x - o.x) / d; fy += (h.y - o.y) / d; threat = true }
  }
  if (threat) { h.want = Math.atan2(fy, fx); return }

  if (h.aggr > 0.4) {
    let prey: Hole | null = null
    let pd = 320
    for (const o of w.holes) {
      if (!o.alive || o === h || r < radiusOf(o) * 1.15) continue
      const d = Math.hypot(o.x - h.x, o.y - h.y)
      if (d < pd) { pd = d; prey = o }
    }
    if (prey) { h.want = Math.atan2(prey.y - h.y, prey.x - h.x); return }
  }

  let best: Thing | null = null
  let bs = 0
  for (const t of w.things) {
    if (t.r >= r * 0.85) continue
    const d = Math.hypot(t.x - h.x, t.y - h.y)
    if (d > 600) continue
    const score = (t.r * t.r) / (d + 40)
    if (score > bs) { bs = score; best = t }
  }
  h.want = best ? Math.atan2(best.y - h.y, best.x - h.x) : h.want + (Math.random() - 0.5)
}

export const step = (w: World, dt: number, humanWant?: number) => {
  if (w.over) return
  const eaten: { h: Hole; by: Hole }[] = []

  for (const h of w.holes) {
    if (!h.alive) continue
    if (h.human) {
      if (humanWant !== undefined) h.want = humanWant
    } else {
      h.think -= dt
      if (h.think <= 0) { h.think = 0.12 + Math.random() * 0.1; think(w, h) }
    }
    const sp = speedOf(h)
    h.x = Math.max(-WORLD, Math.min(WORLD, h.x + Math.cos(h.want) * sp * dt))
    h.y = Math.max(-WORLD, Math.min(WORLD, h.y + Math.sin(h.want) * sp * dt))

    const r = radiusOf(h)
    for (let i = w.things.length - 1; i >= 0; i--) {
      const t = w.things[i]
      if (t.r < r * 0.85 && Math.hypot(t.x - h.x, t.y - h.y) < r * 0.85) {
        h.area += t.r * t.r * 0.7
        w.sucked.push({ ...t, t: 0.25, tx: h.x, ty: h.y, hole: h.id })
        w.things[i] = w.things[w.things.length - 1]
        w.things.pop()
      }
    }
  }

  for (const a of w.holes) {
    if (!a.alive) continue
    for (const b of w.holes) {
      if (!b.alive || a === b || radiusOf(a) < radiusOf(b) * 1.15) continue
      if (eaten.some(e => e.h === b)) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) < radiusOf(a) * 0.75) eaten.push({ h: b, by: a })
    }
  }
  for (const { h, by } of eaten) {
    h.alive = false
    h.place = aliveCount(w) + 1
    by.kills++
    by.area += h.area * 0.6
  }

  for (let i = w.sucked.length - 1; i >= 0; i--) {
    const s = w.sucked[i]
    s.t -= dt
    const owner = w.holes[s.hole]
    s.x += (owner.x - s.x) * Math.min(1, dt * 14)
    s.y += (owner.y - s.y) * Math.min(1, dt * 14)
    if (s.t <= 0) w.sucked.splice(i, 1)
  }

  // keep the streets stocked with small stuff
  w.respawn -= dt
  if (w.respawn <= 0) {
    w.respawn = 0.4
    for (const k of ['coin', 'tree', 'car'] as Kind[]) {
      if (w.things.filter(t => t.kind === k).length < SIZES[k].count) w.things.push(spawn(k))
    }
  }

  w.t += dt

  const alive = w.holes.filter(h => h.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const pool = alive.length ? alive : w.holes.filter(h => h.place === 1)
    const ranked = [...pool].sort((a, b) => b.area - a.area)
    ranked.forEach((h, i) => { h.place = i + 1 })
    w.winner = ranked[0].id
    ranked[0].alive = true
    w.over = true
  }
}
