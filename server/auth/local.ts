import type { Request, Response } from 'express'
import { createLocalUser, verifyLocalLogin } from './users'
import { setSessionCookie, clearSessionCookie } from './session'

export const localAuthRoutes = {
  register: async (req: Request, res: Response) => {
    try {
      const { username, password, email } = req.body ?? {}
      const user = await createLocalUser(username, password, email ?? null)
      setSessionCookie(res, user)
      res.json({ user })
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  },
  login: async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body ?? {}
      const user = await verifyLocalLogin(username, password)
      setSessionCookie(res, user)
      res.json({ user })
    } catch (e) {
      res.status(401).json({ error: (e as Error).message })
    }
  },
  logout: (_req: Request, res: Response) => {
    clearSessionCookie(res)
    res.json({ ok: true })
  },
  me: (req: Request, res: Response) => {
    res.json({ user: req.user ?? null })
  },
}
