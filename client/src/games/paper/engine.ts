export const N = 60
export const ROUND_SEC = 60
export const PLAYERS = 10

const SPEED = 5.5
const TURN = 3.4

export type Player = {
  id: number
  name: string
  hue: number
  human: boolean
  x: number
  y: number
  angle: number
  want: number
  alive: boolean
  trail: number[]
  kills: number
  place: number
  aggr: number
  think: number
  h0: number
  dir: number
  a: number
  b: number
  dist: number
}

export type World = {
  t: number
  owner: Uint8Array
  trailOf: Uint8Array
  players: Player[]
  over: boolean
  winner: number
}

const NAMES = ['Inky', 'Scribble', 'Doodle', 'Sketchy', 'Penny', 'Marker', 'Crayon', 'Dash', 'Loopy']

export const idx = (x: number, y: number) => Math.floor(y) * N + Math.floor(x)

export const land = (w: World, id: number) => {
  let n = 0
  for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === id + 1) n++
  return n
}

export const createWorld = (): World => {
  const humanSlot = Math.floor(Math.random() * PLAYERS)
  let bot = 0
  const owner = new Uint8Array(N * N)
  const players: Player[] = Array.from({ length: PLAYERS }, (_, i) => {
    const a = (i / PLAYERS) * Math.PI * 2
    const human = i === humanSlot
    const x = Math.round(N / 2 + Math.cos(a) * 21)
    const y = Math.round(N / 2 + Math.sin(a) * 21)
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) owner[(y + dy) * N + x + dx] = i + 1
    return {
      id: i,
      name: human ? 'You' : NAMES[bot++],
      hue: (i * 36 + 200) % 360,
      human,
      x: x + 0.5, y: y + 0.5,
      angle: a + Math.PI,
      want: a + Math.PI,
      alive: true,
      trail: [],
      kills: 0,
      place: 0,
      aggr: Math.random(),
      think: Math.random() * 0.2,
      h0: a + Math.PI,
      dir: Math.random() < 0.5 ? 1 : -1,
      a: 6, b: 6, dist: 0,
    }
  })
  return { t: 0, owner, trailOf: new Uint8Array(N * N), players, over: false, winner: -1 }
}

const aliveCount = (w: World) => w.players.reduce((n, p) => n + (p.alive ? 1 : 0), 0)

const kill = (w: World, p: Player, by: Player | null) => {
  if (!p.alive) return
  p.alive = false
  p.place = aliveCount(w) + 1
  if (by && by !== p) by.kills++
  for (const c of p.trail) w.trailOf[c] = 0
  p.trail = []
  for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === p.id + 1) w.owner[i] = 0
}

// close the loop: trail becomes land, then everything the loop fenced off flips too
const claim = (w: World, p: Player) => {
  const me = p.id + 1
  for (const c of p.trail) { w.owner[c] = me; w.trailOf[c] = 0 }
  p.trail = []

  const seen = new Uint8Array(N * N)
  const queue: number[] = []
  const push = (i: number) => {
    if (seen[i] || w.owner[i] === me) return
    seen[i] = 1
    queue.push(i)
  }
  for (let i = 0; i < N; i++) { push(i); push((N - 1) * N + i); push(i * N); push(i * N + N - 1) }
  while (queue.length) {
    const c = queue.pop()!
    const x = c % N, y = (c - x) / N
    if (x > 0) push(c - 1)
    if (x < N - 1) push(c + 1)
    if (y > 0) push(c - N)
    if (y < N - 1) push(c + N)
  }
  for (let i = 0; i < w.owner.length; i++) if (!seen[i]) w.owner[i] = me

  // anyone caught inside the new land is gone
  for (const o of w.players) {
    if (o.alive && o !== p && w.owner[idx(o.x, o.y)] === me) kill(w, o, p)
  }
}

const think = (w: World, p: Player) => {
  const ci = idx(p.x, p.y)
  const home = w.owner[ci] === p.id + 1

  if (p.x < 4 || p.y < 4 || p.x > N - 4 || p.y > N - 4) {
    p.want = Math.atan2(N / 2 - p.y, N / 2 - p.x)
    return
  }

  if (home && p.trail.length === 0) {
    p.h0 = p.angle + (Math.random() - 0.5) * 2
    p.dir = Math.random() < 0.5 ? 1 : -1
    p.a = 4 + Math.random() * 9
    p.b = 4 + Math.random() * 8
    p.want = p.h0
    return
  }

  const goHome = () => {
    let best = -1, bd = Infinity
    for (let i = 0; i < w.owner.length; i++) {
      if (w.owner[i] !== p.id + 1) continue
      const x = i % N, y = (i - x) / N
      const d = (x - p.x) ** 2 + (y - p.y) ** 2
      if (d < bd) { bd = d; best = i }
    }
    if (best >= 0) { const x = best % N; p.want = Math.atan2((best - x) / N + 0.5 - p.y, x + 0.5 - p.x) }
  }

  if (p.dist < p.a) p.want = p.h0
  else if (p.dist < p.a + p.b) p.want = p.h0 + p.dir * Math.PI / 2
  else if (p.dist < 2 * p.a + p.b) p.want = p.h0 + p.dir * Math.PI
  else goHome()

  // go after somebody else's exposed trail
  if (p.aggr > 0.5 && p.dist < p.a + p.b) {
    let bd = 49, tx = 0, ty = 0
    for (const o of w.players) {
      if (!o.alive || o === p) continue
      for (const c of o.trail) {
        const x = c % N + 0.5, y = Math.floor(c / N) + 0.5
        const d = (x - p.x) ** 2 + (y - p.y) ** 2
        if (d < bd) { bd = d; tx = x; ty = y }
      }
    }
    if (bd < 49) p.want = Math.atan2(ty - p.y, tx - p.x)
  }

  // don't run into our own trail
  const px = p.x + Math.cos(p.angle) * 2.5, py = p.y + Math.sin(p.angle) * 2.5
  if (px < 0 || py < 0 || px >= N || py >= N || w.trailOf[idx(px, py)] === p.id + 1) {
    p.want = p.angle - p.dir * 1.6
    p.dist = Math.max(p.dist, p.a + p.b)
  }
}

export const step = (w: World, dt: number, humanWant?: number) => {
  if (w.over) return
  const slices = Math.ceil(dt / 0.02)
  const h = dt / slices
  for (let s = 0; s < slices; s++) sub(w, h, humanWant)
}

const sub = (w: World, dt: number, humanWant?: number) => {
  for (const p of w.players) {
    if (!p.alive) continue

    if (p.human) {
      if (humanWant !== undefined) p.want = humanWant
    } else {
      p.think -= dt
      if (p.think <= 0) { p.think = 0.08 + Math.random() * 0.08; think(w, p) }
    }

    let diff = p.want - p.angle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    p.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff))
    p.x += Math.cos(p.angle) * SPEED * dt
    p.y += Math.sin(p.angle) * SPEED * dt

    if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N) { kill(w, p, null); continue }

    const ci = idx(p.x, p.y)
    const tr = w.trailOf[ci]

    if (tr && tr - 1 !== p.id) kill(w, w.players[tr - 1], p)

    if (tr - 1 === p.id && p.trail.indexOf(ci) < p.trail.length - 4) { kill(w, p, null); continue }

    if (w.owner[ci] === p.id + 1) {
      if (p.trail.length) claim(w, p)
      p.dist = 0
    } else {
      if (tr === 0) { w.trailOf[ci] = p.id + 1; p.trail.push(ci) }
      p.dist += SPEED * dt
    }
  }

  w.t += dt

  const alive = w.players.filter(p => p.alive)
  if (alive.length <= 1 || w.t >= ROUND_SEC) {
    const pool = alive.length ? alive : w.players.filter(p => p.place === 1)
    const scores = new Map(pool.map(p => [p, land(w, p.id)]))
    const ranked = [...pool].sort((a, b) => scores.get(b)! - scores.get(a)!)
    ranked.forEach((p, i) => { p.place = i + 1 })
    w.winner = ranked[0].id
    ranked[0].alive = true
    w.over = true
  }
}
