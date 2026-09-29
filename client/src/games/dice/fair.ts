const enc = new TextEncoder()

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export const randomSeed = () => hex(crypto.getRandomValues(new Uint8Array(32)))

export const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))

// HMAC-SHA256(serverSeed, "clientSeed:nonce") -> first 4 bytes -> 0.00 .. 100.00
export const rollDice = async (serverSeed: string, clientSeed: string, nonce: number) => {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}`)))
  const n = ((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0
  return Math.floor((n / 2 ** 32) * 10001) / 100
}

export const HOUSE_EDGE = 1

export const winChance = (over: boolean, target: number) => (over ? 100 - target : target)

export const multiplier = (chance: number) => Math.floor(((100 - HOUSE_EDGE) / chance) * 10000) / 10000
