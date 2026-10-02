// Generic nonce/verify routes shared by every chain. Adding a new chain
// means writing one file next to ethereum.ts/solana.ts and adding it to
// VERIFIERS below.
import type { Request, Response } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import type { WalletVerifier } from './types'
import { ethereumVerifier } from './ethereum'
import { solanaVerifier } from './solana'
import { findOrCreateWalletUser } from '../users'
import { setSessionCookie } from '../session'

const VERIFIERS: Record<string, WalletVerifier> = {
  ethereum: ethereumVerifier,
  solana: solanaVerifier,
}

const NONCE_TTL_MS = 5 * 60 * 1000
const MAX_PENDING = 10_000
const CHALLENGE_COOKIE = 'stack.wallet_challenge'
// Keyed by a random challenge id that only the requesting browser holds (httpOnly cookie), so nobody else can
// overwrite or burn another user's pending challenge just by knowing their address.
type PendingNonce = { key: string; message: string; expiresAt: number }
const pendingNonces = new Map<string, PendingNonce>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of pendingNonces) if (entry.expiresAt < now) pendingNonces.delete(key)
}, 60_000).unref()

const getVerifier = (chain: unknown): WalletVerifier => {
  if (typeof chain !== 'string' || !VERIFIERS[chain]) throw new Error('unsupported chain')
  return VERIFIERS[chain]
}

const buildMessage = (address: string, nonce: string) =>
  `Sign in to Stack Casino\n\nAddress: ${address}\nNonce: ${nonce}\nThis request will not trigger a transaction or cost any fees.`

export const walletRoutes = {
  // GET /api/auth/wallet/nonce?chain=ethereum&address=0x...
  nonce: (req: Request, res: Response) => {
    try {
      const verifier = getVerifier(req.query.chain)
      const address = String(req.query.address ?? '')
      if (!verifier.isValidAddress(address)) throw new Error('invalid address')

      if (pendingNonces.size >= MAX_PENDING) throw new Error('too many pending sign-ins, try again later')

      const key = `${verifier.chain}:${verifier.normalize(address)}`
      const message = buildMessage(address, randomUUID())
      const old = req.cookies?.[CHALLENGE_COOKIE]
      if (typeof old === 'string') pendingNonces.delete(old)   // one challenge per browser
      const id = randomBytes(24).toString('hex')
      pendingNonces.set(id, { key, message, expiresAt: Date.now() + NONCE_TTL_MS })
      res.cookie(CHALLENGE_COOKIE, id, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: NONCE_TTL_MS,
      })
      res.json({ message })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  },

  // POST /api/auth/wallet/verify { chain, address, signature }
  verify: async (req: Request, res: Response) => {
    try {
      const { address, signature } = req.body ?? {}
      const verifier = getVerifier(req.body?.chain)
      if (typeof address !== 'string' || !verifier.isValidAddress(address)) throw new Error('invalid address')
      if (typeof signature !== 'string' || !signature) throw new Error('missing signature')

      const key = `${verifier.chain}:${verifier.normalize(address)}`
      const id = req.cookies?.[CHALLENGE_COOKIE]
      const pending = typeof id === 'string' ? pendingNonces.get(id) : undefined
      if (!pending || pending.key !== key || pending.expiresAt < Date.now()) throw new Error('nonce expired — request a new one')
      pendingNonces.delete(id)   // one-time use
      res.clearCookie(CHALLENGE_COOKIE)

      const ok = await verifier.verify(address, pending.message, signature)
      if (!ok) throw new Error('signature verification failed')

      const user = await findOrCreateWalletUser(verifier.chain, verifier.normalize(address))
      setSessionCookie(res, user)
      res.json({ user })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  },
}
