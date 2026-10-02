// Road Cross simulation. The server runs this (server/arcade/games/roadcross.ts): traffic, hop timing,
// collisions, multiplier and payout. The browser only says "hop" or "cash out" and draws what it is sent.
import { makeLane, updateLane, hitCar, laneHits, overRoad, HOP_SEC, type Lane } from './traffic'

export const RTP = 0.96
export const MAX_STEPS = 20
export const LANE_LEN = 760
export const HERO_Y = LANE_LEN * 0.6   // where the hero stands along the lanes

// rate = cars spawned per second on each road; tuned by simulation so the real
// survival odds of a hop land close to the nominal chance p
export const DIFFS = [
  { key: 'easy',    label: 'Easy',    p: 0.85, rate: 0.36 },
  { key: 'medium',  label: 'Medium',  p: 0.75, rate: 0.69 },
  { key: 'hard',    label: 'Hard',    p: 0.65, rate: 1.17 },
  { key: 'extreme', label: 'Extreme', p: 0.5,  rate: 2.18 },
] as const

export type DiffKey = (typeof DIFFS)[number]['key']

export const round2 = (n: number) => Math.round(n * 100) / 100
export const multAt = (n: number, p: number) => (n === 0 ? 1 : round2(RTP / Math.pow(p, n)))

export type RoadState = {
  status: 'ready' | 'hopping' | 'dead' | 'cashed'
  step: number
  p: number
  rate: number
  lanes: Lane[]
  hopT: number
  queued: boolean
  t: number
  hit: { u: number; ve: number } | null   // where in the hop the hero was hit, and how fast the car was going
}

export const createRoad = (diff: string): RoadState | null => {
  const d = DIFFS.find(x => x.key === diff)
  if (!d) return null
  return {
    status: 'ready', step: 0, p: d.p, rate: d.rate, hopT: 0, queued: false, t: 0, hit: null,
    lanes: Array.from({ length: MAX_STEPS }, () => makeLane(d.rate, LANE_LEN)),
  }
}

// the jump happens right now: no waiting for a gap, cars decide your fate
export const go = (s: RoadState) => {
  if (s.status === 'ready') { s.status = 'hopping'; s.hopT = 0 }
  else if (s.status === 'hopping') s.queued = true
}

export const canCash = (s: RoadState) => s.status === 'ready' && s.step >= 1

const tick = (s: RoadState, h: number) => {
  s.lanes.forEach(l => updateLane(l, h, LANE_LEN))
  if (s.status !== 'hopping') return
  s.hopT += h
  const u = Math.min(1, s.hopT / HOP_SEC)

  if (overRoad(u) && laneHits(s.lanes[s.step], HERO_Y)) {
    s.hit = { u, ve: hitCar(s.lanes[s.step], HERO_Y)?.ve ?? 300 }
    s.status = 'dead'
    return
  }

  if (u >= 1) {
    s.step++
    s.hopT = 0
    if (s.step >= MAX_STEPS) s.status = 'cashed'   // made it all the way across
    else if (s.queued) s.queued = false             // chained jump starts on the same tick
    else s.status = 'ready'
  }
}

export const stepRoad = (s: RoadState, dt: number) => {
  s.t += dt
  const n = Math.ceil(dt / 0.008)
  for (let i = 0; i < n; i++) tick(s, dt / n)
}
