import type { Request, Response } from 'express'
import { createLocalUser, verifyLocalLogin } from './users'
import { setSessionCookie, clearSessionCookie } from './session'

export const localAuthRoutes = {
  register: async (req: Request, res: Response) => {
    const { username, password, email } = req.body ?? {}
    const user = await createLocalUser(username, password, email ?? null)
    setSessionCookie(res, user)
    res.json({ user })
  },
  login: async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {}
    const user = await verifyLocalLogin(username, password)
    setSessionCookie(res, user)
    res.json({ user })
  },
  logout: (_req: Request, res: Response) => {
    clearSessionCookie(res)
    res.json({ ok: true })
  },
  me: (req: Request, res: Response) => {
    res.json({ user: req.user ?? null })
  },
}
