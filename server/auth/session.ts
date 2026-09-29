// The one place that knows how a logged-in user is represented on the
// wire: an httpOnly JWT cookie. Every sign-in method (local/oauth/wallet)
// calls setSessionCookie with the user it resolved; nothing else here
// cares how that user was authenticated.
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { PublicUser } from './users'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set — copy server/.env.example to server/.env')

export const SESSION_COOKIE = 'stack.session'
const TOKEN_TTL = '30d'
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type SessionUser = PublicUser

export const setSessionCookie = (res: Response, user: SessionUser) => {
  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL })
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
  })
}

export const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE)

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser
    }
  }
}

// Reads the session cookie if present and attaches req.user — never rejects.
export const attachUser = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; username: string }
      req.user = { id: payload.sub, username: payload.username }
    } catch {
      // expired/invalid token — treat as logged out
    }
  }
  next()
}

// Use on routes that require a logged-in user.
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'not logged in' })
  next()
}
