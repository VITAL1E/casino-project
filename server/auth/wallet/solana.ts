import nacl from 'tweetnacl'
import bs58 from 'bs58'
import type { WalletVerifier } from './types'

// Phantom: signMessage over the nonce message, verified as a raw ed25519
// signature against the wallet's public key (the base58 address).
export const solanaVerifier: WalletVerifier = {
  chain: 'solana',

  isValidAddress(address) {
    try {
      return bs58.decode(address).length === 32
    } catch {
      return false
    }
  },

  normalize: (address) => address,

  verify(address, message, signature) {
    try {
      const publicKey = bs58.decode(address)
      const signatureBytes = bs58.decode(signature)
      const messageBytes = new TextEncoder().encode(message)
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey)
    } catch {
      return false
    }
  },
}
