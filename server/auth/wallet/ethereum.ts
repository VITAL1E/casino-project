import { isAddress, verifyMessage } from 'viem'
import type { WalletVerifier } from './types'

// MetaMask (and any other EIP-1193 wallet): personal_sign over the nonce
// message, verified by recovering the signer's address.
export const ethereumVerifier: WalletVerifier = {
  chain: 'ethereum',

  isValidAddress: (address) => isAddress(address),

  normalize: (address) => address.toLowerCase(),

  async verify(address, message, signature) {
    try {
      return await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      })
    } catch {
      return false
    }
  },
}
