import type { OAuthProvider, OAuthProfile } from './types'

const CLIENT_ID = process.env.DISCORD_CLIENT_ID
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI

type DiscordUser = { id: string; username: string; email?: string | null }

export const discordProvider: OAuthProvider = {
  id: 'discord',

  isConfigured: () => Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI),

  buildAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: CLIENT_ID!,
      redirect_uri: REDIRECT_URI!,
      response_type: 'code',
      scope: 'identify email',
      state,
    })
    return `https://discord.com/oauth2/authorize?${params}`
  },

  async exchange(code): Promise<OAuthProfile> {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
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
    if (!tokenRes.ok) throw new Error('discord token exchange failed')
    const { access_token } = await tokenRes.json() as { access_token: string }

    const infoRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!infoRes.ok) throw new Error('discord userinfo failed')
    const info = await infoRes.json() as DiscordUser

    return {
      providerUserId: info.id,
      email: info.email ?? null,
      suggestedUsername: info.username,
    }
  },
}
