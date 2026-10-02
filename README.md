# STACK

A play-money crypto casino and sportsbook demo: React 19 + Vite client, Express + Postgres (Drizzle) server.

- **Arcade games** (Slither, Agar, Hole, Paper, Chicken and Storm Royale, Road Cross, Flappy Cash) run on the server over WebSockets
  (`server/arcade/`). The browser only sends inputs; the server simulates, decides and pays.
- **Classics** (Dice, Limbo, Crash, Mines, Plinko, Keno, HiLo, Roulette, Blackjack) are provably fair
  (`server/classics/`): HMAC-SHA256 server seed + client seed + nonce, verifiable after a seed rotation.
- **Wallet** (`server/wallet.ts`) is the only place balances change: atomic, idempotent, audited by a ledger, with a daily loss limit.
  `server/stakes.ts` keeps money on the table for running games and refunds orphaned stakes after a crash.
- **Rewards** (`server/rewards/`): VIP levels from lifetime wagering and daily challenges, paid as play credits through the wallet.

## Run it locally

```bash
npm install
npm run db:up                  # Postgres in Docker (docker-compose.yml)
cp server/.env.example server/.env
npm run server:dev             # API + game server on :8787 (migrations run on boot)
npm run dev                    # client on http://localhost:5173
```

## Checks

```bash
npm test -w server             # wallet, stakes, classics, rewards and lobby tests (needs the database from db:up)
npm run typecheck -w server
npm run lint -w client && npm run build -w client
```

The tests create throwaway users in the database from `DATABASE_URL` and delete them afterwards. CI (`.github/workflows/ci.yml`)
runs the same checks against a Postgres service and also builds both Docker images.

## Deploy

One host with Docker, a domain pointing at it, ports 80/443 open:

```bash
cp deploy/.env.example deploy/.env      # DOMAIN, POSTGRES_PASSWORD, JWT_SECRET (32+ random characters), optional OAuth / odds keys
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

- `web` is Caddy: it serves the prerendered site, gets a Let's Encrypt certificate by itself and proxies `/api`, `/ws` and the
  live-wins stream to `server`. Security headers are set there (a full Content-Security-Policy is report-only until checked per page).
- `server` refuses to boot in production with a weak `JWT_SECRET` or a non-https `CLIENT_ORIGIN` (`server/env.ts`). Set `TRUST_PROXY=1`
  behind a proxy so rate limits see the visitor's address (the compose file does).
- `/healthz` (liveness) and `/readyz` (database reachable) are for the orchestrator.
- On start the server applies pending migrations, refunds stakes of games that died with the previous process, and checks that every
  wallet equals its ledger (a mismatch is logged as `LEDGER MISMATCH`).
- Run a single server instance: matches live in its memory. Scaling out needs saved match state and a shared store first.

The Docker files were written without a local Docker install, so the first `docker compose ... --build` is their first real run.

## Before real money

This is a play-money demo. Real money would additionally need a gambling licence, identity checks and AML, TLS (provided by Caddy),
a real sportsbook data feed, server-authoritative versions of anything still client-side, and an external security review.
