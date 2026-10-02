// Snapshot the server streams for Road Cross (shared by server/arcade/games/roadcross.ts and RoadCross.tsx).
// Only the roads around the hero are sent; cars carry ids so the browser can keep a model per car.
export type RoadSnap = {
  status: 'ready' | 'hopping' | 'dead' | 'cashed'
  step: number
  hopT: number
  t: number
  hit: { u: number; ve: number } | null
  cars: [lane: number, id: number, y: number, ve: number, len: number, hue: number][]
}
