import { apiCall } from './apiClient'

export type Tier = { key: string; name: string; min: number; reward: number }
export type ChallengeDef = { id: string; title: string; metric: string; target: number; reward: number }
export type RewardsInfo = { tiers: Tier[]; challenges: ChallengeDef[] }

export type Vip = {
  wagered: number
  level: { key: string; name: string }
  next: { key: string; name: string; min: number; remaining: number } | null
  tiers: (Tier & { reached: boolean; claimed: boolean })[]
  claimable: number
}

export type ChallengeState = ChallengeDef & { progress: number; done: boolean; claimed: boolean }
export type Challenges = { period: string; resetsAt: string; challenges: ChallengeState[] }

export const getRewardsInfo = () => apiCall<RewardsInfo>('/api/rewards/info')
export const getVip = () => apiCall<Vip>('/api/rewards/vip')
export const claimVip = () => apiCall<{ credited: number; balance: number }>('/api/rewards/vip/claim', {})
export const getChallenges = () => apiCall<Challenges>('/api/rewards/challenges')
export const claimChallenge = (id: string) => apiCall<{ reward: number; balance: number }>(`/api/rewards/challenges/${id}/claim`, {})
