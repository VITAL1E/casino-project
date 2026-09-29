import type { User } from '../authApi'

// One connector per wallet, one shared shape. AuthModal/SocialAuth only
// ever call connect() — they don't know or care whether that meant
// window.ethereum or window.solana under the hood.
export interface WalletConnector {
  readonly id: string
  isAvailable(): boolean
  connect(): Promise<User>
}

export class WalletError extends Error {}
