// Minimal Phantom provider shape — just connect() and signMessage().
interface PhantomProvider {
  isPhantom?: boolean
  connect(): Promise<{ publicKey: { toString(): string } }>
  signMessage(message: Uint8Array, encoding: 'utf8'): Promise<{ signature: Uint8Array }>
}

interface Window {
  solana?: PhantomProvider
}
