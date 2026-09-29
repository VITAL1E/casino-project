// Small, dependency-free building blocks for a few OWASP security
// principles (https://devguide.owasp.org/en/02-foundations/03-security-principles/):
// secure defaults (headers below), defense in depth + minimized attack
// surface (rate limiting login/register/wallet-verify so they're not a
// free brute-force oracle even though passwords are bcrypt-hashed and
// wallet signatures are unforgeable).
import type { Request, Response, NextFunction } from 'express'

// Fail securely: these are defaults every response gets, not opt-in.
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
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
