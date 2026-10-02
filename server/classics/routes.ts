import type { Express } from 'express'
import { requireAuth } from '../auth'
import { PublicError, rateLimit } from '../security'
import { instantGame, statefulGame } from './games'
import { getFair, rotate, setClientSeed } from './fair'
import { actRound, currentRound, playInstant, startRound } from './service'

const limiter = rateLimit(60_000, 180)            // per address
const userLimiter = rateLimit(60_000, 120, true)   // and per account

export const registerClassicsRoutes = (app: Express) => {
  app.get('/api/classics/fair', requireAuth, async (req, res) => {
    res.json(await getFair(req.user!.id))
  })

  app.post('/api/classics/fair/client-seed', requireAuth, limiter, userLimiter, async (req, res) => {
    res.json(await setClientSeed(req.user!.id, req.body?.clientSeed))
  })

  app.post('/api/classics/fair/rotate', requireAuth, limiter, userLimiter, async (req, res) => {
    res.json(await rotate(req.user!.id))
  })

  // instant games: Dice, Limbo, Plinko, Keno, Roulette. stateful: Mines, HiLo, Blackjack (starts a round)
  app.post('/api/classics/:game/bet', requireAuth, limiter, userLimiter, async (req, res) => {
    const key = String(req.params.game)
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    if (instantGame(key)) return void res.json(await playInstant(req.user!.id, key, body))
    if (statefulGame(key)) return void res.json(await startRound(req.user!.id, key, body))
    throw new PublicError('unknown game')
  })

  app.post('/api/classics/:game/action', requireAuth, limiter, userLimiter, async (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    res.json(await actRound(req.user!.id, String(req.params.game), body))
  })

  app.get('/api/classics/:game/active', requireAuth, async (req, res) => {
    res.json(await currentRound(req.user!.id, String(req.params.game)))
  })
}
