// Flappy Cash simulation. The server runs this (server/arcade/games/flappy.ts) and streams the
// state to the browser; the browser only sends flaps and cash-outs. Logical world: H tall, the bird
// sits at BIRD_X, pipes scroll left toward it.
export const GRAVITY = 1500
export const FLAP = -430
export const PIPE_W = 64
export const SPACING = 250
export const BIRD_R = 15
export const GROUND = 36
export const MAX_PIPES = 60
export const H = 520
export const W = 640
export const BIRD_X = W * 0.28

export const DIFFS = [
  { key: 'easy',   label: 'Easy',   gap: 178, speed: 150, growth: 1.09 },
  { key: 'medium', label: 'Medium', gap: 150, speed: 175, growth: 1.16 },
  { key: 'hard',   label: 'Hard',   gap: 128, speed: 205, growth: 1.27 },
] as const

export type DiffKey = (typeof DIFFS)[number]['key']

export const round2 = (n: number) => Math.round(n * 100) / 100
export const multAt = (n: number, growth: number) => (n === 0 ? 1 : round2(Math.pow(growth, n)))

export type Pipe = { x: number; gapY: number; passed: boolean }
export type FlappyState = {
  status: 'ready' | 'flying' | 'dead' | 'cashed'
  y: number
  vy: number
  pipes: Pipe[]
  score: number
  growth: number
  gap: number
  speed: number
  t: number
}

export const createFlappy = (diff: string): FlappyState | null => {
  const d = DIFFS.find(x => x.key === diff)
  if (!d) return null
  return { status: 'ready', y: (H - GROUND) / 2, vy: 0, pipes: [], score: 0, growth: d.growth, gap: d.gap, speed: d.speed, t: 0 }
}

export const flap = (s: FlappyState) => {
  if (s.status === 'ready') s.status = 'flying'
  if (s.status === 'flying') s.vy = FLAP
}

const physics = (s: FlappyState, h: number) => {
  s.vy += GRAVITY * h
  s.y += s.vy * h

  for (const p of s.pipes) p.x -= s.speed * h
  while (s.pipes.length && s.pipes[0].x < -PIPE_W - 10) s.pipes.shift()
  if (s.pipes.length < 7 && s.pipes.length < MAX_PIPES) {
    const lastX = s.pipes.length ? s.pipes[s.pipes.length - 1].x : W * 0.9 - SPACING
    const m = 60
    s.pipes.push({ x: lastX + SPACING, gapY: m + s.gap / 2 + Math.random() * (H - GROUND - 2 * m - s.gap), passed: false })
  }

  let crashed = s.y - BIRD_R < 0 || s.y + BIRD_R > H - GROUND
  for (const p of s.pipes) {
    if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) { p.passed = true; s.score++ }
    const inX = BIRD_X + BIRD_R * 0.8 > p.x && BIRD_X - BIRD_R * 0.8 < p.x + PIPE_W
    if (inX && (s.y - BIRD_R * 0.8 < p.gapY - s.gap / 2 || s.y + BIRD_R * 0.8 > p.gapY + s.gap / 2)) crashed = true
  }
  if (crashed) {
    s.y = Math.min(s.y, H - GROUND - BIRD_R)
    s.status = 'dead'
  }
}

export const stepFlappy = (s: FlappyState, dt: number) => {
  s.t += dt
  if (s.status !== 'flying') return
  const n = Math.ceil(dt / 0.008)
  for (let i = 0; i < n && s.status === 'flying'; i++) physics(s, dt / n)
}

// cash out is only allowed mid-flight after at least one pipe
export const canCash = (s: FlappyState) => s.status === 'flying' && s.score >= 1
