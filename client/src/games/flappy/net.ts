// Snapshot the server streams for Flappy Cash (shared by server/arcade/games/flappy.ts and Flappy.tsx).
export type FlappySnap = {
  status: 'ready' | 'flying' | 'dead' | 'cashed'
  y: number
  vy: number
  score: number
  t: number
  pipes: [x: number, gapY: number, passed: 0 | 1][]
}
