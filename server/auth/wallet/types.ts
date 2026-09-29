// Same pattern as oauth/types.ts: one interface per chain, a registry in
// index.ts. "Sign a server-issued nonce with your wallet" is the same flow
// for every chain — only address validation and signature verification differ.
export interface WalletVerifier {
  readonly chain: string
  isValidAddress(address: string): boolean
  verify(address: string, message: string, signature: string): Promise<boolean> | boolean
  /** Normalizes an address for storage/lookup (e.g. lowercasing hex). */
  normalize(address: string): string
}
