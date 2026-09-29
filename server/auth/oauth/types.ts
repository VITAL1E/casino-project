// Every OAuth provider (Google, Discord, and whatever gets added next)
// implements this one interface. Nothing outside oauth/ needs to know how
// a specific provider's token/userinfo endpoints work — see index.ts's
// registry and generic start/callback handlers.
export type OAuthProfile = {
  providerUserId: string
  email: string | null
  suggestedUsername: string
}

export interface OAuthProvider {
  readonly id: string
  /** True when this provider has the env vars it needs to run. */
  isConfigured(): boolean
  buildAuthUrl(state: string): string
  exchange(code: string): Promise<OAuthProfile>
}
