import { createFlappy, flap, stepFlappy, canCash, multAt, type FlappyState } from '../../../client/src/games/flappy/engine'
import type { FlappySnap } from '../../../client/src/games/flappy/net'
import type { SoloEngine } from '../solo'

const r1 = (n: number) => Math.round(n * 10) / 10

export const flappyEngine: SoloEngine<FlappyState> = {
  key: 'flappy',
  label: 'Flappy Cash',
  gameId: 'o16',

  create: opts => createFlappy(String(opts.diff)),
  act: (s, action) => { if (action === 'flap') flap(s) },
  canCash,
  cash: s => { s.status = 'cashed' },
  step: stepFlappy,
  status: s => (s.status === 'flying' ? 'live' : s.status),
  mult: s => multAt(s.score, s.growth),

  snapshot: (s): FlappySnap => ({
    status: s.status, y: r1(s.y), vy: r1(s.vy), score: s.score, t: Math.round(s.t * 100) / 100,
    pipes: s.pipes.map(p => [r1(p.x), r1(p.gapY), p.passed ? 1 : 0] as FlappySnap['pipes'][number]),
  }),
}
