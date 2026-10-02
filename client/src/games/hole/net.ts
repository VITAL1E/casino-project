// Snapshot the server streams for Hole Royale (shared by server/arcade/games/hole.ts and Hole.tsx).
import type { Kind } from './engine'

export const KINDS: Kind[] = ['coin', 'tree', 'car', 'house', 'tower']

export type HoleSnap = {
  t: number
  holes: { id: number; x: number; y: number; area: number; al: boolean; k: number; p: number }[]
  thingsAdd: [id: number, x: number, y: number, r: number, kind: number, hue: number][]
  thingsDel: number[]
  sucked: { id: number; x: number; y: number; r: number; kind: number; hue: number; t: number; hole: number }[]
}
