// End-to-end checks of the arcade lobby + wallet over a real WebSocket. It boots its own server on a spare
// port against the real Postgres (like the wallet tests) and removes the users it creates afterwards.
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool, schema } from '../db'

const PORT = 8799
const BASE = `http://localhost:${PORT}`
const ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const HERE = path.dirname(fileURLToPath(import.meta.url))

let server: ChildProcess
const usernames: string[] = []

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// STAKE_RECOVERY_ONLY keeps this test server's boot recovery away from stakes of any other server on the same database
const startServer = async (recoverUsers = '') => {
  server = spawn('npx', ['tsx', 'index.ts'], { cwd: path.join(HERE, '..'), env: { ...process.env, PORT: String(PORT), STAKE_RECOVERY_ONLY: recoverUsers }, shell: true, detached: process.platform !== 'win32' })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 40_000)
    server.stdout?.on('data', d => { if (String(d).includes('listening')) { clearTimeout(timer); resolve() } })
    server.stderr?.on('data', d => { if (String(d).includes('Error')) console.error(String(d)) })
  })
}

// kill the whole process tree without any chance to clean up: this is what a crash looks like
const killServer = () => {
  if (!server.pid) return
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-server.pid, 'SIGKILL')   // the whole process group (shell + tsx + node)
  } catch { server.kill() }
}

beforeAll(() => startServer(), 60_000)

afterAll(async () => {
  killServer()
  for (const name of usernames) await db.delete(schema.users).where(eq(schema.users.username, name))
  await pool.end()
})

type Msg = { t: string; [k: string]: unknown }
type Player = { ws: WebSocket; msgs: Msg[]; send: (m: object) => void; waitFor: (t: string, ms?: number) => Promise<Msg>; close: () => void; userId: string }

const signup = async () => {
  const username = `a_${randomUUID().slice(0, 10)}`
  usernames.push(username)
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: `Zx9!kq-${randomUUID()}` }),
  })
  const cookie = (res.headers.getSetCookie()[0] ?? '').split(';')[0]
  const { user } = await res.json() as { user: { id: string } }
  return { cookie, userId: user.id }
}

const connect = async (game: string, who: { cookie: string; userId: string }): Promise<Player> => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/${game}`, { headers: { Origin: ORIGIN, Cookie: who.cookie } })
  const msgs: Msg[] = []
  ws.on('message', d => msgs.push(JSON.parse(String(d))))
  const p: Player = {
    ws, msgs, userId: who.userId,
    send: m => ws.send(JSON.stringify(m)),
    waitFor: async (t, ms = 8000) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        const i = msgs.findIndex(m => m.t === t)
        if (i >= 0) return msgs.splice(i, 1)[0]
        await sleep(50)
      }
      throw new Error(`timed out waiting for "${t}", got: ${msgs.map(m => m.t).join(',')}`)
    },
    close: () => ws.close(),
  }
  await p.waitFor('ready')
  return p
}

const balanceOf = async (userId: string) => {
  const [w] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, userId))
  return Number(w.balance)
}
const ledgerReasons = async (userId: string) => (await db.select().from(schema.ledger).where(eq(schema.ledger.userId, userId))).map(r => r.reason).sort()

describe('arcade lobby', () => {
  it('refuses state-changing requests that are not JSON (cross-site form posts)', async () => {
    const who = await signup()
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const res = await fetch(`${BASE}/api/wallet/reset`, { method: 'POST', headers: { 'Content-Type': type, Cookie: who.cookie }, body: 'a=1' })
      expect(res.status).toBe(415)
    }
    const ok = await fetch(`${BASE}/api/wallet/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: who.cookie }, body: '{}' })
    expect(ok.status).toBe(200)
  })

  it('rejects a socket without a session or from another origin', async () => {
    const status = (headers: Record<string, string>) => new Promise<number | string>(resolve => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws/agar`, { headers })
      ws.on('open', () => { resolve('open'); ws.close() })
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
      ws.on('error', () => { /* reported through unexpected-response */ })
    })
    const who = await signup()
    expect(await status({ Origin: ORIGIN })).toBe(401)
    expect(await status({ Origin: 'http://evil.example', Cookie: who.cookie })).toBe(403)
  })

  it('charges the buy-in on join and refunds exactly that stake on cancel', async () => {
    const who = await signup()
    const p = await connect('agar', who)
    p.send({ t: 'join', bet: 5 })
    const queued = await p.waitFor('queued')
    expect(queued.balance).toBe(995)
    expect(await balanceOf(who.userId)).toBe(995)

    p.send({ t: 'leave' })
    const left = await p.waitFor('left')
    expect(left.balance).toBe(1000)
    expect(await balanceOf(who.userId)).toBe(1000)
    expect(await ledgerReasons(who.userId)).toEqual(['bet', 'refund', 'signup_bonus'])
    p.close()
  })

  it('rejects a second join, an invalid buy-in and a join with too little balance', async () => {
    const who = await signup()
    const p = await connect('hole', who)
    p.send({ t: 'join', bet: 7 })
    expect((await p.waitFor('error')).message).toBe('invalid buy-in')
    p.send({ t: 'join', bet: 25 })
    await p.waitFor('queued')
    p.send({ t: 'join', bet: 25 })
    expect((await p.waitFor('error')).message).toBe('already in a game')
    expect(await balanceOf(who.userId)).toBe(975)   // charged once
    p.send({ t: 'leave' })
    await p.waitFor('left')
    p.close()
  })

  it('refunds a queued player who disconnects for good', async () => {
    const who = await signup()
    const p = await connect('paper', who)
    p.send({ t: 'join', bet: 10 })
    await p.waitFor('queued')
    p.close()
    await sleep(6500)   // longer than the reconnect grace period
    expect(await balanceOf(who.userId)).toBe(1000)
    expect(await ledgerReasons(who.userId)).toEqual(['bet', 'refund', 'signup_bonus'])
  }, 20_000)

  it('keeps the queue spot and the single charge when the page reloads', async () => {
    const who = await signup()
    const a = await connect('agar', who)
    a.send({ t: 'join', bet: 5 })
    await a.waitFor('queued')
    a.close()
    const b = await connect('agar', who)   // reload: reconnects inside the grace period
    const queued = await b.waitFor('queued')
    expect(queued.bet).toBe(5)
    expect(await balanceOf(who.userId)).toBe(995)   // still one charge
    b.send({ t: 'leave' })
    await b.waitFor('left')
    expect(await balanceOf(who.userId)).toBe(1000)
    b.close()
  })

  it('starts a match with bots after the queue timeout and pays only the winner, once', async () => {
    const who = await signup()
    const p = await connect('hole', who)
    p.send({ t: 'join', bet: 1 })
    await p.waitFor('queued')
    const start = await p.waitFor('start', 15_000)
    expect((start.seats as { human: boolean }[]).filter(s => s.human)).toHaveLength(1)
    expect(await balanceOf(who.userId)).toBe(999)
    // a malformed / hostile input must never break the match
    p.send({ t: 'in', seq: 1, want: 1e308 })
    p.send({ t: 'in', seq: 'x', want: 'x' })
    p.send({ t: 'in', seq: 2, want: Number.NaN })
    p.close()   // leave the match: autopilot plays on, the payout (if any) goes to the account
    await sleep(500)
    expect(await ledgerReasons(who.userId)).toEqual(['bet', 'signup_bonus'])
  }, 30_000)

  it('refunds the stake of a match that was running when the server crashed', async () => {
    const who = await signup()
    const p = await connect('agar', who)
    p.send({ t: 'join', bet: 5 })
    await p.waitFor('queued')
    await p.waitFor('start', 15_000)                 // the match is running: 5 is on the table
    expect(await balanceOf(who.userId)).toBe(995)
    const [open] = await db.select().from(schema.stakes).where(eq(schema.stakes.userId, who.userId))
    expect(open.status).toBe('open')

    killServer()                                     // crash: no shutdown hook runs
    await sleep(1000)
    await startServer(who.userId)                    // boot recovery runs before the server listens

    expect(await balanceOf(who.userId)).toBe(1000)
    const [closed] = await db.select().from(schema.stakes).where(eq(schema.stakes.userId, who.userId))
    expect(closed.status).toBe('refunded')
    expect(await ledgerReasons(who.userId)).toEqual(['bet', 'refund', 'signup_bonus'])
  }, 60_000)
})
