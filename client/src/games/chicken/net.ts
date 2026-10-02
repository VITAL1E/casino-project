// Snapshot the server streams for Chicken Royale (shared by server/arcade/games/chicken.ts and Chicken.tsx).
import type { GameEvent } from './engine'

export type ChickenSnap = {
  t: number
  chickens: { id: number; x: number; z: number; vx: number; vz: number; angle: number; mx: number; mz: number; hp: number; gold: number; al: boolean; falling: number; k: number; p: number }[]
  eggs: [x: number, z: number, vx: number, vz: number, life: number, owner: number, gold: 0 | 1][]
  pickups: [x: number, z: number][]
  events: GameEvent[]   // everything that happened since the previous snapshot (hits, splats, ...)
}
