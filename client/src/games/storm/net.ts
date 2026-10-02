// What the server streams for Storm Royale (shared by server/arcade/games/storm.ts and StormRoyale.tsx).
// The static map is rebuilt from `seed` on the client; only built walls travel as deltas.
import type { GameEvent, LootKind, WeaponKey } from './engine'

export type StormInit = { seed: number }

export type StormSnap = {
  t: number
  players: {
    id: number; x: number; y: number; z: number; yaw: number; pitch: number
    hp: number; shield: number; mats: number; weapons: WeaponKey[]; slot: number
    al: boolean; k: number; p: number; lastShot: number
  }[]
  lootAdd: [id: number, x: number, z: number, kind: LootKind][]
  lootDel: number[]
  buildAdd: [id: number, x: number, z: number, w: number, d: number, h: number, owner: number][]
  buildDel: number[]
  events: GameEvent[]   // everything that happened since the previous snapshot
}
