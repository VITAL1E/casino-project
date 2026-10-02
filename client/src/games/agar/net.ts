// Snapshot the server streams for Agar Royale (shared by server/arcade/games/agar.ts and Agar.tsx).
export type AgarSnap = {
  t: number
  cells: { id: number; x: number; y: number; mass: number; hp: number; al: boolean; k: number; p: number }[]
  foodAdd: [id: number, x: number, y: number, v: number, hue: number][]
  foodDel: number[]
}
