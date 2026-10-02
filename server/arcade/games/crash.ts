import { CRASH_RATE, crashMultAt, crashPoint, crashTimeOf } from '../../../client/src/games/classics/math'
import type { Rng } from '../../classics/fair'
import type { SoloEngine } from '../solo'

type CrashState = { status: 'live' | 'dead' | 'cashed'; t: number; point: number; crashT: number; cashedMult: number }
export type CrashSnap = { status: CrashState['status']; t: number; mult: number; point?: number }

const MIN_CASH = 1.01

export const crashEngine: SoloEngine<CrashState> = {
  key: 'crash',
  label: 'Crash',
  gameId: 'o4',
  fair: true,

  // the crash point is fixed the moment the bet is placed, from the provably fair stream
  create: (_opts, rng?: Rng) => {
    if (!rng) return { status: 'live', t: 0, point: 1, crashT: 0, cashedMult: 0 }   // validation pass only
    const point = crashPoint(rng.next())
    return { status: 'live', t: 0, point, crashT: crashTimeOf(point), cashedMult: 0 }
  },
  act: () => undefined,
  canCash: s => s.status === 'live' && crashMultAt(s.t) >= MIN_CASH,
  cash: s => { s.cashedMult = crashMultAt(Math.min(s.t, s.crashT)); s.status = 'cashed' },
  step: (s, dt) => {
    if (s.status !== 'live') return
    s.t += dt
    if (s.t >= s.crashT) { s.t = s.crashT; s.status = 'dead' }
  },
  status: s => s.status,
  mult: s => s.cashedMult,

  snapshot: (s): CrashSnap => ({
    status: s.status, t: Math.round(s.t * 1000) / 1000, mult: crashMultAt(s.t),
    ...(s.status !== 'live' ? { point: s.point } : {}),   // the crash point is only revealed once the run is over
  }),
}

export const CRASH_GROWTH = CRASH_RATE
