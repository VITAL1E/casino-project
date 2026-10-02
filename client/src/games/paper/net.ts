// Snapshot the server streams for Paper Royale (shared by server/arcade/games/paper.ts and Paper.tsx).
// Trails are sent per player (the mirror rebuilds the trail grid from them); the land grid only when it changed.
export type PaperSnap = {
  t: number
  players: { id: number; x: number; y: number; angle: number; al: boolean; k: number; p: number; trail: number[] }[]
  owner?: string   // base64 of the N*N ownership grid
}
