import type { Express } from 'express'
import { requireAuth } from '../auth'
import { rateLimit } from '../security'
import { CHALLENGES, TIERS } from './defs'
import { claimChallenge, claimVip, getChallenges, getVip } from './service'

const limiter = rateLimit(60_000, 60)
const userLimiter = rateLimit(60_000, 30, true)

export const registerRewardsRoutes = (app: Express) => {
  // public: what can be earned (also shown to visitors who are not logged in)
  app.get('/api/rewards/info', (_req, res) => {
    res.json({
      tiers: TIERS,
      challenges: CHALLENGES.map(({ id, title, metric, target, reward }) => ({ id, title, metric, target, reward })),
    })
  })

  app.get('/api/rewards/vip', requireAuth, async (req, res) => { res.json(await getVip(req.user!.id)) })
  app.post('/api/rewards/vip/claim', requireAuth, limiter, userLimiter, async (req, res) => { res.json(await claimVip(req.user!.id)) })

  app.get('/api/rewards/challenges', requireAuth, async (req, res) => { res.json(await getChallenges(req.user!.id)) })
  app.post('/api/rewards/challenges/:id/claim', requireAuth, limiter, userLimiter, async (req, res) => {
    res.json(await claimChallenge(req.user!.id, String(req.params.id)))
  })
}
