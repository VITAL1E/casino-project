import bs58 from 'bs58'
import { getWalletNonce, verifyWallet } from '../authApi'
import { WalletError, type WalletConnector } from './types'

export const phantomConnector: WalletConnector = {
  id: 'phantom',

  isAvailable: () => typeof window !== 'undefined' && Boolean(window.solana?.isPhantom),

  async connect() {
    const { solana } = window
    if (!solana) throw new WalletError('Phantom is not installed')

    const { publicKey } = await solana.connect()
    const address = publicKey.toString()

    const message = await getWalletNonce('solana', address)
    const { signature } = await solana.signMessage(new TextEncoder().encode(message), 'utf8')
    return verifyWallet('solana', address, bs58.encode(signature))
  },
}
