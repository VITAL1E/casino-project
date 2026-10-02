// REST client for the classic games (server/classics/). The server decides every outcome; the browser only
// sends a bet or an action and renders the response.
import { apiCall } from '../../lib/apiClient'

export type Proof = { nonce: number; clientSeed: string; serverSeedHash: string }
export type Fair = { serverSeedHash: string; clientSeed: string; nonce: number; previous: Revealed | null }
export type Revealed = { serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number }

export type InstantResult<D = Record<string, unknown>> = {
  balance: number; stake: number; payout: number; mult: number; details: D; proof: Proof
}
export type RoundDone = { outcome: 'won' | 'lost' | 'refunded'; mult: number; payout: number }
export type RoundReply<V = Record<string, unknown>> = { roundId: string; bet: number; proof: Proof; view: V; balance: number; done?: RoundDone }

export const instantBet = <D,>(game: string, body: object) => apiCall<InstantResult<D>>(`/api/classics/${game}/bet`, body)
export const startRound = <V,>(game: string, body: object) => apiCall<RoundReply<V>>(`/api/classics/${game}/bet`, body)
export const roundAction = <V,>(game: string, body: object) => apiCall<RoundReply<V>>(`/api/classics/${game}/action`, body)
export const activeRound = <V,>(game: string) =>
  apiCall<{ round: { roundId: string; bet: number; proof: Proof; view: V } | null }>(`/api/classics/${game}/active`)

export const getFair = () => apiCall<Fair>('/api/classics/fair')
export const setClientSeed = (clientSeed: string) => apiCall<{ serverSeedHash: string; clientSeed: string; nonce: number }>('/api/classics/fair/client-seed', { clientSeed })
export const rotateSeed = () => apiCall<{ previous: Revealed; serverSeedHash: string; clientSeed: string; nonce: number }>('/api/classics/fair/rotate', {})
