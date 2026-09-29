import type { Express } from 'express'
import { getOdds, SPORT_KEYS } from './oddsApi'
import { placeBet, listBets } from './bets'
import { rateLimit } from '../security'
import { requireAuth } from '../auth'

export { startSettlementLoop } from './settlement'

const betLimiter = rateLimit(60_000, 30)

const resolveSportKey = (tab: unknown): string => {
  if (typeof tab !== 'string' || !SPORT_KEYS[tab]) throw new Error('unknown sport')
  return SPORT_KEYS[tab]
}

export const registerSportsRoutes = (app: Express) => {
  app.get('/api/sports/list', (_req, res) => {
    res.json({ sports: Object.keys(SPORT_KEYS) })
  })

  app.get('/api/sports/:sport/odds', async (req, res) => {
    try {
      const sportKey = resolveSportKey(req.params.sport)
      res.json({ sportKey, events: await getOdds(sportKey) })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  })

  app.post('/api/sports/bets', requireAuth, betLimiter, async (req, res) => {
    try {
      const sportKey = resolveSportKey(req.body?.sport)
      const { eventId, selection, stake } = req.body ?? {}
      if (typeof eventId !== 'string' || typeof selection !== 'string') throw new Error('missing eventId/selection')
      const result = await placeBet(req.user!.id, sportKey, eventId, selection, Number(stake))
      res.json(result)
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  })

  app.get('/api/sports/bets', requireAuth, async (req, res) => {
    try {
      res.json({ bets: await listBets(req.user!.id) })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  })
}
