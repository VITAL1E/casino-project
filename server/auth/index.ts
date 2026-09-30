// Barrel: server/index.ts mounts auth with a single call and never needs
// to know how local/oauth/wallet sign-in are each implemented.
import type { Express } from 'express'
import { localAuthRoutes } from './local'
import { oauthRoutes } from './oauth'
import { walletRoutes } from './wallet'
import { rateLimit } from '../security'

export { attachUser, requireAuth, userFromCookieHeader } from './session'
export type { SessionUser } from './session'

// Every credential-checking endpoint gets a per-IP rate limit — defense in
// depth against brute force even though passwords are bcrypt-hashed and
// wallet signatures can't be forged; free-standing lookups (nonce/me) don't
// need it since they don't check a secret.
const authLimiter = rateLimit(60_000, 20)

export const registerAuthRoutes = (app: Express) => {
  app.post('/api/auth/register', authLimiter, localAuthRoutes.register)
  app.post('/api/auth/login', authLimiter, localAuthRoutes.login)
  app.post('/api/auth/logout', localAuthRoutes.logout)
  app.get('/api/auth/me', localAuthRoutes.me)

  app.get('/api/auth/oauth/:provider/start', oauthRoutes.start)
  app.get('/api/auth/oauth/:provider/callback', authLimiter, oauthRoutes.callback)

  app.get('/api/auth/wallet/nonce', walletRoutes.nonce)
  app.post('/api/auth/wallet/verify', authLimiter, walletRoutes.verify)
}
