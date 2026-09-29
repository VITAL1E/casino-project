import { getWalletNonce, verifyWallet } from '../authApi'
import { WalletError, type WalletConnector } from './types'

export const metamaskConnector: WalletConnector = {
  id: 'metamask',

  isAvailable: () => typeof window !== 'undefined' && Boolean(window.ethereum),

  async connect() {
    const { ethereum } = window
    if (!ethereum) throw new WalletError('MetaMask is not installed')

    const [address] = await ethereum.request({ method: 'eth_requestAccounts' })
    if (!address) throw new WalletError('No account selected in MetaMask')

    const message = await getWalletNonce('ethereum', address)
    const signature = await ethereum.request({ method: 'personal_sign', params: [message, address] })
    return verifyWallet('ethereum', address, signature)
  },
}
