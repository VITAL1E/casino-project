export const ROAD_W = 88
export const STRIP_W = 60
export const STEP_W = ROAD_W + STRIP_W
export const CAR_W = 44
export const HERO_R = 14
export const HOP_SEC = 0.42

export type Car = { id: number; y: number; v: number; ve: number; len: number; hue: number }
export type Lane = { cars: Car[]; timer: number; rate: number }

const SPEED_MIN = 180
const SPEED_MAX = 620
const GAP = 50

// once in a while a car comes through much faster than the rest
const FAST_CHANCE = 0.12
const FAST_MIN = 950
const FAST_MAX = 1400

let nextCarId = 1   // unique per process: lets a snapshot refer to a car across frames
const exp = (rate: number) => -Math.log(1 - Math.random()) / rate

export const makeLane = (rate: number, H: number): Lane => {
  const lane: Lane = { cars: [], timer: exp(rate), rate }
  // warm up so the road is already busy when the round starts
  for (let t = 0; t < 12; t += 0.05) updateLane(lane, 0.05, H)
  return lane
}

export const updateLane = (lane: Lane, dt: number, H: number) => {
  lane.timer -= dt
  if (lane.timer <= 0) {
    lane.timer += exp(lane.rate)
    const len = Math.random() < 0.3 ? 120 : 76
    const last = lane.cars[lane.cars.length - 1]
    if (!last || last.y - last.len / 2 > len / 2 + GAP) {
      const v = Math.random() < FAST_CHANCE
        ? FAST_MIN + Math.random() * (FAST_MAX - FAST_MIN)
        : SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
      lane.cars.push({ id: nextCarId++, y: -len, v, ve: v, len, hue: Math.random() * 360 })
    }
  }
  // cars queue behind slower ones instead of driving through them
  for (let i = 0; i < lane.cars.length; i++) {
    const c = lane.cars[i]
    const lead = lane.cars[i - 1]
    c.ve = c.v
    if (lead && lead.y - lead.len / 2 - (c.y + c.len / 2) < GAP) c.ve = Math.min(c.v, lead.ve)
  }
  for (const c of lane.cars) c.y += c.ve * dt
  while (lane.cars.length && lane.cars[0].y - lane.cars[0].len / 2 > H) lane.cars.shift()
}

export const hitCar = (lane: Lane, heroY: number) =>
  lane.cars.find(c => Math.abs(c.y - heroY) < c.len / 2 + HERO_R)

export const laneHits = (lane: Lane, heroY: number) => !!hitCar(lane, heroY)

// hero x (relative to the strip it jumps from) while hopping, u = 0..1
export const hopX = (u: number) => u * STEP_W

// true while the hero overlaps the car column of the road it is crossing
export const overRoad = (u: number) => Math.abs(hopX(u) - (STRIP_W / 2 + ROAD_W / 2)) < CAR_W / 2 + HERO_R
