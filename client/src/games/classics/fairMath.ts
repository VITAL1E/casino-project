// Browser-side verification helpers for the provably fair games (same maths as server/classics/fair.ts).
const enc = new TextEncoder()
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))

// Same stream as the server: HMAC-SHA256(serverSeed, "client:nonce:round") -> floats in [0, 1)
export const floatsFor = async (serverSeed: string, clientSeed: string, nonce: number, count = 8) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const out: number[] = []
  for (let round = 0; out.length < count; round++) {
    const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${round}`)))
    for (let i = 0; i < 8; i++) out.push(b[4 * i] / 256 + b[4 * i + 1] / 256 ** 2 + b[4 * i + 2] / 256 ** 3 + b[4 * i + 3] / 256 ** 4)
  }
  return out.slice(0, count)
}
