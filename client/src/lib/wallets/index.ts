import { metamaskConnector } from './metamask'
import { phantomConnector } from './phantom'
import type { WalletConnector } from './types'

export type { WalletConnector } from './types'
export { WalletError } from './types'

export const walletConnectors: Record<string, WalletConnector> = {
  metamask: metamaskConnector,
  phantom: phantomConnector,
}
