// Game server. Every arcade game (server/arcade/) is server-authoritative over a
// WebSocket: matchmaking, the 60Hz simulation, results and payouts all live here;
// the browser only sends inputs and renders the snapshots it receives. The
// server also owns the wallet balance.
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
//   - the same server-authoritative treatment for the classic Originals
//     (Dice, Mines, Crash...) — every arcade game already runs in server/arcade/
//   - a real sportsbook license/data feed — see the ODDS_API_KEY comment
//     in server/.env.example for why this is play-money only for now
import 'dotenv/config'
import './env'   // refuses to boot a production server with unsafe settings
import express from 'express'
import cookieParser from 'cookie-parser'
import { sql } from 'drizzle-orm'
import { db, migrate, pool } from './db'
import { attachUser, requireAuth, registerAuthRoutes } from './auth'
import { securityHeaders, requireJson, rateLimit, errorHandler } from './security'
import { getBalance, reset, startLedgerAudit } from './wallet'
import { recoverStakes } from './stakes'
import { registerSportsRoutes, startSettlementLoop } from './sports'
import { streamWins, startDemoFeed } from './liveWins'
import { startArcade } from './arcade'
import { registerClassicsRoutes } from './classics/routes'
import { registerRewardsRoutes } from './rewards/routes'
import { startClassicsSweeper } from './classics/service'

const resetLimiter = rateLimit(60_000, 5)

const app = express()
// Health checks for the orchestrator / proxy (no auth, no CORS, nothing sensitive).
app.get('/healthz', (_req, res) => { res.json({ ok: true }) })
app.get('/readyz', async (_req, res) => {
  try { await db.select({ n: sql<number>`1` }); res.json({ ok: true }) }
  catch { res.status(503).json({ ok: false }) }
})

app.use(securityHeaders)
app.use(requireJson)
app.use(express.json({ limit: '64kb' }))   // minimize attack surface: every API body is tiny
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
registerClassicsRoutes(app)
registerRewardsRoutes(app)

app.get('/api/wallet', requireAuth, async (req, res) => {
  res.json({ balance: await getBalance(req.user!.id) })
})

app.post('/api/wallet/reset', requireAuth, resetLimiter, async (req, res) => {
  res.json({ balance: await reset(req.user!.id) })
})

app.get('/api/events/wins', streamWins)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 8787

migrate()
  .then(async () => {
    // games die with the process: give their stakes back. STAKE_RECOVERY_ONLY (comma separated user ids) narrows this
    // for tests that run a second server against a shared database; leave it unset in real deployments.
    const only = process.env.STAKE_RECOVERY_ONLY
    const orphans = await recoverStakes(only !== undefined ? only.split(',').filter(Boolean) : undefined)
    if (orphans) console.log(`recovered ${orphans} open stake(s) from the previous run`)
    const server = app.listen(PORT, () => console.log(`server listening on :${PORT}`))
    // Graceful stop: matches die with the process and their stakes are refunded at the next boot (see stakes.ts).
    const stop = (signal: string) => {
      console.log(`${signal}: shutting down`)
      server.close()
      setTimeout(() => process.exit(0), 5000).unref()
      void pool.end().finally(() => process.exit(0))
    }
    process.on('SIGTERM', () => stop('SIGTERM'))
    process.on('SIGINT', () => stop('SIGINT'))
    startArcade(server, ORIGIN)
    startSettlementLoop()
    startLedgerAudit()
    startClassicsSweeper()
    startDemoFeed()
  })
  .catch(e => {
    console.error('migration failed — is Postgres running? (docker compose up -d)', e)
    process.exit(1)
  })
