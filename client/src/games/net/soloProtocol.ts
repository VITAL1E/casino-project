// Wire format for the single-player, server-authoritative arcade games (Flappy, Road Cross).
// The server runs the whole session (physics, traffic, crash / cash-out, payout); the client only sends
// actions (flap, hop, cash out) and renders the snapshots it gets back.
export type SoloClientMsg =
  | { t: 'start'; bet: number; opts: Record<string, unknown> }
  | { t: 'act'; a: 'flap' | 'go' | 'cash' }

// Provably fair games (Crash) say which seeds a run was drawn from so it can be verified after the seed is rotated.
export type SoloProof = { nonce: number; clientSeed: string; serverSeedHash: string }

export type SoloResult = { result: 'crash' | 'cash'; payout: number; bet: number; balance: number; mult: number }

export type SoloServerMsg<Snap = unknown> =
  | { t: 'ready'; balance: number; resume: boolean }   // resume: a session is about to be re-attached
  | { t: 'started'; balance: number; bet: number; snap: Snap; proof?: SoloProof }
  | { t: 'snap'; snap: Snap }
  | ({ t: 'done'; snap: Snap; proof?: SoloProof } & SoloResult)
  | { t: 'error'; message: string }
