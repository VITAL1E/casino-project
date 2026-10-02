import { createRoad, go, canCash, stepRoad, multAt, MAX_STEPS, type RoadState } from '../../../client/src/games/roadcross/engine'
import type { RoadSnap } from '../../../client/src/games/roadcross/net'
import type { SoloEngine } from '../solo'

const r1 = (n: number) => Math.round(n * 10) / 10

export const roadcrossEngine: SoloEngine<RoadState> = {
  key: 'roadcross',
  label: 'Road Cross',
  gameId: 'o15',

  create: opts => createRoad(String(opts.diff)),
  act: (s, action) => { if (action === 'go') go(s) },
  canCash,
  cash: s => { s.status = 'cashed' },
  step: stepRoad,
  status: s => (s.status === 'hopping' ? 'live' : s.status === 'ready' && s.step === 0 ? 'ready' : s.status === 'ready' ? 'live' : s.status),
  mult: s => multAt(s.step, s.p),

  snapshot: (s): RoadSnap => {
    // only the roads around the hero are ever drawn
    const from = Math.max(0, s.step - 1), to = Math.min(MAX_STEPS - 1, s.step + 6)
    const cars: RoadSnap['cars'] = []
    for (let k = from; k <= to; k++) {
      for (const c of s.lanes[k].cars) cars.push([k, c.id, r1(c.y), r1(c.ve), c.len, Math.round(c.hue)])
    }
    return { status: s.status, step: s.step, hopT: Math.round(s.hopT * 1000) / 1000, t: Math.round(s.t * 100) / 100, hit: s.hit, cars }
  },
}
