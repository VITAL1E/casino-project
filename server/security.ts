// Small, dependency-free building blocks for a few OWASP security
// principles (https://devguide.owasp.org/en/02-foundations/03-security-principles/):
// secure defaults (headers below), defense in depth + minimized attack
// surface (rate limiting login/register/wallet-verify so they're not a
// free brute-force oracle even though passwords are bcrypt-hashed and
// wallet signatures are unforgeable).
import type { Request, Response, NextFunction } from 'express'
import { createHash } from 'node:crypto'

// Fail securely: these are defaults every response gets, not opt-in.
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
}

// Only PublicError messages ever reach the client; anything else (DB/driver/
// upstream errors) is logged and replaced with a generic message so internals
// never leak (fail securely).
export class PublicError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// Express 5 forwards rejected async handlers here, so routes need no try/catch.
// Register last.
export const errorHandler = (e: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (e instanceof PublicError) return void res.status(e.status).json({ error: e.message })
  console.error(e)
  res.status(400).json({ error: 'request failed' })
}

export const MIN_STAKE = 0.01
export const MAX_STAKE = 10_000

// Rejects non-numbers, NaN/Infinity, sub-cent and oversized amounts; returns
// the amount rounded to cents so what's stored equals what's debited.
export const parseStake = (v: unknown): number => {
  if (typeof v !== 'number' && typeof v !== 'string') throw new PublicError('bad amount')
  const n = Math.round(Number(v) * 100) / 100
  if (!Number.isFinite(n) || n < MIN_STAKE || n > MAX_STAKE) throw new PublicError('bad amount')
  return n
}

type Bucket = { count: number; resetAt: number }

// In-memory sliding-ish window, per process. Good enough for a single
// instance; a multi-instance deployment needs this backed by Redis instead
// (noted here rather than silently pretending it scales).
export const rateLimit = (windowMs: number, max: number) => {
  const buckets = new Map<string, Bucket>()

  setInterval(() => {
    const now = Date.now()
    for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key)
  }, windowMs).unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (bucket.count >= max) {
      return res.status(429).json({ error: 'too many requests, try again later' })
    }
    bucket.count++
    next()
  }
}

// HIBP Pwned Passwords k-anonymity check: only the first 5 hex chars of the
// SHA-1 leave the server. Fails open (returns false) if HIBP is unreachable
// so an outage can't block signups.
export const isPwnedPassword = async (password: string): Promise<boolean> => {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const suffix = sha1.slice(5)
    return (await res.text()).split('\n').some(l => {
      const [s, count] = l.trim().split(':')
      return s === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}
