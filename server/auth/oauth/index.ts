// Generic start/callback routes shared by every OAuth provider. Adding a
// new provider means writing one file next to google.ts/discord.ts and
// adding it to PROVIDERS below — nothing else in the app changes.
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import type { OAuthProvider } from './types'
import { googleProvider } from './google'
import { discordProvider } from './discord'
import { findOrCreateOAuthUser } from '../users'
import { setSessionCookie } from '../session'

const PROVIDERS: Record<string, OAuthProvider> = {
  google: googleProvider,
  discord: discordProvider,
}

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const STATE_COOKIE = 'oauth.state'

const getProvider = (id: unknown): OAuthProvider => {
  const provider = typeof id === 'string' ? PROVIDERS[id] : undefined
  if (!provider) throw new Error(`unknown oauth provider: ${id}`)
  if (!provider.isConfigured()) throw new Error(`oauth provider not configured: ${id}`)
  return provider
}

export const oauthRoutes = {
  // GET /api/auth/oauth/:provider/start — redirects the browser to the provider.
  start: (req: Request, res: Response) => {
    try {
      const provider = getProvider(req.params.provider)
      const state = randomUUID()
      res.cookie(STATE_COOKIE, `${provider.id}:${state}`, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
      })
      res.redirect(provider.buildAuthUrl(state))
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  },

  // GET /api/auth/oauth/:provider/callback — provider redirects back here with ?code&state.
  callback: async (req: Request, res: Response) => {
    try {
      const provider = getProvider(req.params.provider)
      const { code, state } = req.query
      const expected = req.cookies?.[STATE_COOKIE]
      res.clearCookie(STATE_COOKIE)
      if (!code || typeof code !== 'string') throw new Error('missing code')
      if (!state || expected !== `${provider.id}:${state}`) throw new Error('invalid oauth state')

      const profile = await provider.exchange(code)
      const user = await findOrCreateOAuthUser(provider.id, profile.providerUserId, profile)
      setSessionCookie(res, user)
      res.redirect(CLIENT_ORIGIN)
    } catch (e) {
      res.redirect(`${CLIENT_ORIGIN}?authError=${encodeURIComponent((e as Error).message)}`)
    }
  },
}
