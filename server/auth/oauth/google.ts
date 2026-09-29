import type { OAuthProvider, OAuthProfile } from './types'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

type GoogleUserInfo = { sub: string; email?: string; name?: string }

export const googleProvider: OAuthProvider = {
  id: 'google',

  isConfigured: () => Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI),

  buildAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: CLIENT_ID!,
      redirect_uri: REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchange(code): Promise<OAuthProfile> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI!,
        grant_type: 'authorization_code',
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error('google token exchange failed')
    const { access_token } = await tokenRes.json() as { access_token: string }

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!infoRes.ok) throw new Error('google userinfo failed')
    const info = await infoRes.json() as GoogleUserInfo

    return {
      providerUserId: info.sub,
      email: info.email ?? null,
      suggestedUsername: info.name ?? info.email?.split('@')[0] ?? 'googleuser',
    }
  },
}
