// Minimal EIP-1193 shape — just enough of window.ethereum to request
// accounts and personal_sign. Not a full provider typing.
interface Eip1193Provider {
  request(args: { method: 'eth_requestAccounts' }): Promise<string[]>
  request(args: { method: 'personal_sign'; params: [message: string, address: string] }): Promise<string>
}

interface Window {
  ethereum?: Eip1193Provider
}
