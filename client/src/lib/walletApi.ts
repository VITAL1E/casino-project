import { apiCall } from './apiClient'

export const getWallet = () => apiCall<{ balance: number }>('/api/wallet')
export const resetWallet = () => apiCall<{ balance: number }>('/api/wallet/reset', {})
