import type { Express } from 'express'
import { getOdds, SPORT_KEYS } from './oddsApi'
import { placeBet, listBets } from './bets'
import { rateLimit, PublicError } from '../security'
import { requireAuth } from '../auth'

export { startSettlementLoop } from './settlement'

const betLimiter = rateLimit(60_000, 30)

const resolveSportKey = (tab: unknown): string => {
  if (typeof tab !== 'string' || !SPORT_KEYS[tab]) throw new PublicError('unknown sport')
  return SPORT_KEYS[tab]
}

export const registerSportsRoutes = (app: Express) => {
  app.get('/api/sports/list', (_req, res) => {
    res.json({ sports: Object.keys(SPORT_KEYS) })
  })

  app.get('/api/sports/:sport/odds', async (req, res) => {
    const sportKey = resolveSportKey(req.params.sport)
    res.json({ sportKey, events: await getOdds(sportKey) })
  })

  app.post('/api/sports/bets', requireAuth, betLimiter, async (req, res) => {
    const sportKey = resolveSportKey(req.body?.sport)
    const { eventId, selection, stake } = req.body ?? {}
    if (typeof eventId !== 'string' || typeof selection !== 'string') throw new PublicError('missing eventId/selection')
    res.json(await placeBet(req.user!.id, sportKey, eventId, selection, stake))
  })

  app.get('/api/sports/bets', requireAuth, async (req, res) => {
    res.json({ bets: await listBets(req.user!.id) })
  })
}
