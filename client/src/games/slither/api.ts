// Talks to the reference verification server (server/index.ts). The server
// picks the seed, owns the wallet, and independently replays every round to
// decide the outcome — nothing here ever computes a payout itself.
//
// Auth is a real logged-in session now (see src/lib/authApi.ts) — the
// server reads it from an httpOnly cookie, so these routes need
// `credentials: 'include'` and nothing else, and will 401 if logged out.
import { apiCall, ApiError } from '../../lib/apiClient'
import { getWallet, resetWallet } from '../../lib/walletApi'
import type { RecordedInput } from './replay'

export { ApiError, getWallet, resetWallet }

export const startRound = (bet: number) =>
  apiCall<{ roundId: string; seed: number; players: number; balance: number }>('/api/slither/start', { bet })

export const finishRound = (roundId: string, inputs: RecordedInput[]) =>
  apiCall<{ won: boolean; place: number; kills: number; payoutMultiplier: number; payout: number; bet: number; balance: number }>(
    '/api/slither/finish',
    { roundId, inputs },
  )
