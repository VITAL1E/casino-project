// Wire format shared by the browser and the server (server/slither/). The
// client only ever sends INPUTS (where it wants to steer, whether it is
// boosting); everything else here flows server -> client.
export const BUY_INS = [1, 5, 10, 25, 100] as const
export const QUEUE_SEC = 10   // wait this long for other humans before bots fill the empty seats
export const SNAPSHOT_HZ = 20

export type ClientMsg =
  | { t: 'join'; bet: number }
  | { t: 'leave' }
  | { t: 'in'; seq: number; want: number; boost: boolean }   // one per client tick, seq counts up from 1

export type SnakeSnap = {
  id: number
  x: number
  y: number
  a: number      // heading
  len: number
  hp: number
  al: boolean    // alive
  bo: boolean    // boosting
  ack: number    // last input seq the server applied to this snake (0 for bots)
  k: number      // kills
  p: number      // final place (0 while still alive)
  b: number[]    // body as a flat [x0, y0, x1, y1, ...]
}

export type FoodSnap = [id: number, x: number, y: number, value: number, hue: number]

export type Snap = {
  time: number
  snakes: SnakeSnap[]
  foodAdd: FoodSnap[]
  foodDel: number[]
}

export type SeatInfo = { id: number; name: string; hue: number; human: boolean }

export type ServerMsg =
  | { t: 'ready'; balance: number; resume: boolean }   // resume: a queue or match is about to be re-attached
  | { t: 'queued'; bet: number; balance: number }
  | { t: 'queue'; players: number; max: number; startsInMs: number }
  | { t: 'left'; balance: number }
  | { t: 'start'; you: number; bet: number; beginsInMs: number; seats: SeatInfo[]; snap: Snap }
  | { t: 'snap'; snap: Snap }
  | { t: 'end'; place: number; kills: number; payout: number; bet: number; balance: number; winner: string }
  | { t: 'error'; message: string }
