// Wire format shared by the browser and the server (server/arcade/) for every
// server-authoritative arcade game. The client only ever sends INPUTS; the
// server runs the game and streams snapshots back. Each game defines its own
// snapshot / input shape, everything around it (queue, start, end) is common.
export const BUY_INS = [1, 5, 10, 25, 100] as const
export const QUEUE_SEC = 10   // wait this long for other humans before bots fill the empty seats
export const SNAPSHOT_HZ = 20

export type SeatInfo = { id: number; name: string; hue: number; human: boolean }

export type NetClientMsg =
  | { t: 'join'; bet: number }
  | { t: 'leave' }
  | ({ t: 'in'; seq: number } & Record<string, unknown>)   // input fields are game specific

export type NetServerMsg<Snap = unknown, Init = unknown> =
  | { t: 'ready'; balance: number; resume: boolean }   // resume: a queue or match is about to be re-attached
  | { t: 'queued'; bet: number; balance: number }
  | { t: 'queue'; players: number; max: number; startsInMs: number }
  | { t: 'left'; balance: number }
  | { t: 'start'; you: number; bet: number; beginsInMs: number; seats: SeatInfo[]; init: Init; snap: Snap }
  | { t: 'snap'; snap: Snap }
  | { t: 'end'; place: number; kills: number; payout: number; bet: number; balance: number; winner: string }
  | { t: 'error'; message: string }
