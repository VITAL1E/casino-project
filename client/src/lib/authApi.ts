// Talks to the real auth endpoints (server/auth/). Session lives in an
// httpOnly cookie the server sets — `credentials: 'include'` is what sends
// it back on every request, there's no token to store client-side.
import { API_BASE, ApiError, apiCall } from './apiClient'

export { API_BASE }
export const AuthApiError = ApiError

export type User = { id: string; username: string }

export const register = (username: string, password: string, email?: string) =>
  apiCall<{ user: User }>('/api/auth/register', { username, password, email }).then(r => r.user)

export const login = (username: string, password: string) =>
  apiCall<{ user: User }>('/api/auth/login', { username, password }).then(r => r.user)

export const logout = () => apiCall<{ ok: true }>('/api/auth/logout', {})

export const me = () => apiCall<{ user: User | null }>('/api/auth/me').then(r => r.user)

// Google/Discord: a plain redirect kicks off the flow, the server handles
// the rest and redirects back with the session cookie already set.
export type OAuthProviderId = 'google' | 'discord'
export const oauthStartUrl = (provider: OAuthProviderId) => `${API_BASE}/api/auth/oauth/${provider}/start`

// MetaMask/Phantom: sign a server-issued nonce instead. See src/lib/wallets/.
export type WalletChain = 'ethereum' | 'solana'
export const getWalletNonce = (chain: WalletChain, address: string) =>
  apiCall<{ message: string }>(`/api/auth/wallet/nonce?${new URLSearchParams({ chain, address })}`).then(r => r.message)

export const verifyWallet = (chain: WalletChain, address: string, signature: string) =>
  apiCall<{ user: User }>('/api/auth/wallet/verify', { chain, address, signature }).then(r => r.user)
