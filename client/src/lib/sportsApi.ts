// Talks to server/sports/. Same rules as slither/api.ts: cookie session
// via credentials: 'include', server is authoritative for odds/payouts —
// this file never computes a payout itself, just displays what comes back.
import { apiCall, ApiError } from './apiClient'

export { ApiError as SportsApiError }

export type OddsOutcome = { name: string; price: number }
export type OddsEvent = {
  id: string
  sportKey: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  outcomes: OddsOutcome[]
}

export type SportsBet = {
  id: string
  eventId: string
  sportKey: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  selection: string
  odds: number
  stake: number
  potentialPayout: number
  status: 'pending' | 'won' | 'lost' | 'void'
  createdAt: string
  settledAt: string | null
}

export const listSports = () => apiCall<{ sports: string[] }>('/api/sports/list').then(r => r.sports)

export const getOdds = (sport: string) =>
  apiCall<{ sportKey: string; events: OddsEvent[] }>(`/api/sports/${sport}/odds`).then(r => r.events)

export const placeBet = (sport: string, eventId: string, selection: string, stake: number) =>
  apiCall<{ bet: SportsBet; balance: number }>('/api/sports/bets', { sport, eventId, selection, stake })

export const listMyBets = () => apiCall<{ bets: SportsBet[] }>('/api/sports/bets').then(r => r.bets)
