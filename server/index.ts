// Reference verification server for Slither Royale.
//
// The server picks the round's random seed (never the client), the server
// owns the wallet balance, and when a round ends the server independently
// re-simulates it from the seed plus the human player's recorded steering
// inputs (see src/games/slither/replay.ts) to work out who actually won.
// The client's own on-screen game is just a preview — only the server's
// replay result is ever paid out.
//
// Auth: real accounts (server/auth/) — password, Google/Discord OAuth, or
// MetaMask/Phantom wallet sign-in, all converging on the same JWT-in-an-
// httpOnly-cookie session (server/auth/session.ts). Wallet balance and
// every debit/credit live in Postgres via Drizzle ORM (server/db/schema.ts,
// server/store.ts) with row locking (`.for('update')`) and an audit ledger.
//
// Security: see CLAUDE.md's OWASP reference. Concretely here: parameterized
// SQL everywhere (never trust input), secure response headers + a request
// size cap + per-IP rate limiting on the auth endpoints (secure defaults +
// defense in depth), session in an httpOnly/sameSite cookie, generic auth
// error messages that don't reveal which check failed (fail securely).
//
// Sports betting (server/sports/) is play-money against the same wallet —
// real odds proxied from The Odds API (never called from the browser: it
// needs a key and a tiny free quota, so responses are cached here), but
// settlement is automatic and the payout is server-computed off the
// server's own cached line, never off whatever the client last saw.
//
// Live wins (server/liveWins.ts) is a public Server-Sent Events stream —
// one-directional, so plain HTTP instead of a WebSocket. Every settled win
// (slither payout, sports bet) broadcasts to it.
//
// STILL MISSING before this can touch real money:
//   - TLS in front of this (rate limiting/headers are not a substitute)
//   - the same treatment (seeded engine + server replay) for every other
//     Originals game — only Slither Royale has been done so far
//   - a real sportsbook license/data feed — see the ODDS_API_KEY comment
//     in server/.env.example for why this is play-money only for now
import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { migrate } from './db'
import { attachUser, requireAuth, registerAuthRoutes } from './auth'
import { securityHeaders } from './security'
import { startRound, finishRound } from './rounds'
import { getBalance, resetBalance } from './store'
import { registerSportsRoutes, startSettlementLoop } from './sports'
import { streamWins, broadcastWin, startDemoFeed } from './liveWins'
import { randomUUID } from 'node:crypto'

const app = express()
app.use(securityHeaders)
app.use(express.json({ limit: '512kb' }))   // minimize attack surface: cap request size
app.use(cookieParser())

const ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(attachUser)
registerAuthRoutes(app)
registerSportsRoutes(app)

app.get('/api/wallet', requireAuth, async (req, res) => {
  try { res.json({ balance: await getBalance(req.user!.id) }) }
  catch (e) { res.status(400).json({ error: (e as Error).message }) }
})

app.post('/api/wallet/reset', requireAuth, async (req, res) => {
  try { res.json({ balance: await resetBalance(req.user!.id) }) }
  catch (e) { res.status(400).json({ error: (e as Error).message }) }
})

app.post('/api/slither/start', requireAuth, async (req, res) => {
  try {
    const bet = Number(req.body?.bet)
    const round = await startRound(req.user!.id, bet)
    res.json(round)
  } catch (e) { res.status(400).json({ error: (e as Error).message }) }
})

app.post('/api/slither/finish', requireAuth, async (req, res) => {
  try {
    const { roundId, inputs } = req.body ?? {}
    if (typeof roundId !== 'string') throw new Error('missing roundId')
    const result = await finishRound(req.user!.id, roundId, inputs)
    res.json(result)
    if (result.payout > 0) {
      broadcastWin({
        id: randomUUID(), gameId: 'o10', label: 'Slither Royale',
        username: req.user!.username, amount: result.payout, at: new Date().toISOString(),
      })
    }
  } catch (e) { res.status(400).json({ error: (e as Error).message }) }
})

app.get('/api/events/wins', streamWins)

const PORT = Number(process.env.PORT) || 8787

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`slither verification server listening on :${PORT}`))
    startSettlementLoop()
    startDemoFeed()
  })
  .catch(e => {
    console.error('migration failed — is Postgres running? (docker compose up -d)', e)
    process.exit(1)
  })
