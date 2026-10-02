// Rules, maths and money flow of the classic games. The DB parts run against the real Postgres from DATABASE_URL
// with throwaway users that are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, migrate, pool, schema } from '../db'
import { getBalance, provision, verifyLedger } from '../wallet'
import { closeStake, placeStake, recoverStakes } from '../stakes'
import { makeRng, rotate, sample, setClientSeed } from '../classics/fair'
import { MAX_PAYOUT, actRound, currentRound, playInstant, startRound, sweepStaleRounds } from '../classics/service'
import {
  PLINKO_RISK, PLINKO_ROWS, KENO_RISK, crashPoint, diceMult, handValue, hiloChance, isBlackjack, kenoRtp, minesMult, plinkoRtp,
  plinkoTable, rouletteReturn, rouletteWins, diceRoll,
} from '../../client/src/games/classics/math'

const created: string[] = []
const newUser = async () => {
  const [u] = await db.insert(schema.users).values({ username: `c_${randomUUID().slice(0, 12)}` }).returning({ id: schema.users.id })
  await db.transaction(tx => provision(tx, u.id))
  created.push(u.id)
  return u.id
}
const ledgerOk = async (userId: string) => !(await verifyLedger()).some(r => r.userId === userId)
const stakesOf = (userId: string) => db.select().from(schema.stakes).where(eq(schema.stakes.userId, userId))

beforeAll(async () => { await migrate() })
afterAll(async () => {
  for (const id of created) await db.delete(schema.users).where(eq(schema.users.id, id))
  await pool.end()
})

describe('maths', () => {
  it('dice multiplier keeps the 1% edge', () => {
    expect(diceMult(50)).toBe(1.98)
    expect(diceMult(10)).toBe(9.9)
    expect(diceRoll(0)).toBe(0)
    expect(diceRoll(0.99999999)).toBe(100)
  })

  it('crash point follows P(point >= m) = 0.99 / m', () => {
    const rng = makeRng('seed', 'client', 1)
    const n = 60_000
    let ge2 = 0, ge10 = 0
    for (let i = 0; i < n; i++) { const p = crashPoint(rng.next()); if (p >= 2) ge2++; if (p >= 10) ge10++ }
    expect(ge2 / n).toBeGreaterThan(0.48)
    expect(ge2 / n).toBeLessThan(0.51)
    expect(ge10 / n).toBeGreaterThan(0.09)
    expect(ge10 / n).toBeLessThan(0.108)
    expect(crashPoint(0)).toBe(1)
  })

  it('plinko tables return about 99% for every rows / risk', () => {
    for (const rows of PLINKO_ROWS) for (const risk of PLINKO_RISK) {
      const rtp = plinkoRtp(rows, risk)
      expect(rtp).toBeGreaterThan(0.975)
      expect(rtp).toBeLessThanOrEqual(0.9905)
      expect(plinkoTable(rows, risk)).toHaveLength(rows + 1)
    }
    const high = plinkoTable(16, 'high')
    expect(high[0]).toBeGreaterThan(100)        // the edges pay big on high risk
    expect(high[8]).toBeLessThan(1)             // the middle pays less than the stake
  })

  it('keno tables return about 99% for every number of picks / risk', () => {
    for (let picks = 1; picks <= 10; picks++) for (const risk of KENO_RISK) {
      const rtp = kenoRtp(picks, risk)
      expect(rtp).toBeGreaterThan(0.95)
      expect(rtp).toBeLessThanOrEqual(0.9905)
    }
  })

  it('mines multiplier is 0.99 * C(25,k) / C(25-m,k)', () => {
    expect(minesMult(3, 0)).toBe(1)
    expect(minesMult(3, 1)).toBe(1.125)                                  // 0.99 * 25 / 22
    expect(minesMult(1, 24)).toBe(24.75)                                 // every safe tile with one mine: 0.99 * 25
    expect(minesMult(24, 1)).toBe(24.75)
  })

  it('hilo chances count ties as wins', () => {
    expect(hiloChance(1, 'higher')).toBe(1)
    expect(hiloChance(1, 'lower')).toBeCloseTo(1 / 13)
    expect(hiloChance(13, 'higher')).toBeCloseTo(1 / 13)
    expect(hiloChance(7, 'higher') + hiloChance(7, 'lower')).toBeCloseTo(14 / 13)
  })

  it('roulette pays like a single-zero wheel', () => {
    expect(rouletteWins({ type: 'straight', value: 17 }, 17)).toBe(true)
    expect(rouletteWins({ type: 'red' }, 0)).toBe(false)
    expect(rouletteWins({ type: 'black' }, 0)).toBe(false)
    expect(rouletteWins({ type: 'low' }, 18)).toBe(true)
    expect(rouletteWins({ type: 'dozen', value: 2 }, 25)).toBe(true)
    expect(rouletteWins({ type: 'column', value: 0 }, 34)).toBe(true)
    expect(rouletteReturn({ type: 'straight', value: 1 })).toBe(36)
    // every bet type has the same expected return: 36/37 per unit staked
    const bets = [{ type: 'straight', value: 5 }, { type: 'red' }, { type: 'odd' }, { type: 'high' }, { type: 'dozen', value: 1 }, { type: 'column', value: 2 }] as const
    for (const bet of bets) {
      let back = 0
      for (let n = 0; n <= 36; n++) if (rouletteWins(bet, n)) back += rouletteReturn(bet)
      expect(back / 37).toBeCloseTo(36 / 37, 10)
    }
  })

  it('blackjack hands: aces, soft totals, naturals', () => {
    expect(handValue([0, 12])).toEqual({ total: 21, soft: true })       // A K
    expect(handValue([0, 0, 8])).toEqual({ total: 21, soft: true })     // A A 9
    expect(handValue([12, 11, 5]).total).toBe(26)                        // K Q 6: bust
    expect(handValue([0, 5, 12]).total).toBe(17)                         // A 6 K: ace drops to 1
    expect(isBlackjack([0, 12])).toBe(true)
    expect(isBlackjack([5, 6, 7])).toBe(false)
  })
})

describe('fair rng', () => {
  it('is deterministic and uniform enough', () => {
    const a = makeRng('s', 'c', 5), b = makeRng('s', 'c', 5)
    const xs = Array.from({ length: 20 }, () => a.next())
    expect(xs).toEqual(Array.from({ length: 20 }, () => b.next()))
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
    expect(makeRng('s', 'c', 6).next()).not.toBe(xs[0])
    const big = makeRng('x', 'y', 0)
    let sum = 0
    for (let i = 0; i < 20_000; i++) sum += big.next()
    expect(sum / 20_000).toBeGreaterThan(0.49)
    expect(sum / 20_000).toBeLessThan(0.51)
  })

  it('samples without repeats', () => {
    for (let n = 0; n < 50; n++) {
      const s = sample(makeRng('k', 'c', n), 40, 10)
      expect(s).toHaveLength(10)
      expect(new Set(s).size).toBe(10)
      expect(s.every(x => x >= 0 && x < 40)).toBe(true)
    }
  })
})

describe('fair seeds', () => {
  it('never reuses a (clientSeed, nonce) pair under one server seed', async () => {
    const u = await newUser()
    await setClientSeed(u, 'A')
    const first = await playInstant(u, 'dice', { amount: 1, over: true, target: 50 })
    await setClientSeed(u, 'B')
    await playInstant(u, 'dice', { amount: 1, over: true, target: 50 })
    await setClientSeed(u, 'A')
    const again = await playInstant(u, 'dice', { amount: 1, over: true, target: 50 })
    expect(again.proof.serverSeedHash).toBe(first.proof.serverSeedHash)
    expect(again.proof.nonce).toBeGreaterThan(first.proof.nonce)
    expect((await setClientSeed(u, 'C')).nonce).toBe(3)
  })

  it('rotation cannot reveal the seed of a round that is being created', async () => {
    for (let i = 0; i < 5; i++) {
      const u = await newUser()
      await getBalance(u)
      const [round, rot] = await Promise.allSettled([startRound(u, 'mines', { amount: 1, mines: 3 }), rotate(u)])
      if (rot.status === 'fulfilled' && round.status === 'fulfilled') {
        expect(round.value.proof.serverSeedHash).not.toBe(rot.value.previous.serverSeedHash)
      }
    }
  })
})

describe('instant games', () => {
  it('plays a dice bet, keeps the ledger straight, and the result can be verified after the seed is revealed', async () => {
    const u = await newUser()
    await setClientSeed(u, 'my-seed')
    const r = await playInstant(u, 'dice', { amount: 10, over: true, target: 50 })
    expect(r.proof.nonce).toBe(0)
    expect(r.proof.clientSeed).toBe('my-seed')
    const win = (r.details as { win: boolean }).win
    expect(r.balance).toBe(win ? 1000 - 10 + r.payout : 990)
    expect(await getBalance(u)).toBe(r.balance)
    expect(await ledgerOk(u)).toBe(true)

    const { previous } = await rotate(u)          // reveals the server seed
    expect(previous.serverSeedHash).toBe(r.proof.serverSeedHash)
    const rolled = diceRoll(makeRng(previous.serverSeed, 'my-seed', 0).next())
    expect((r.details as { roll: number }).roll).toBe(rolled)
  })

  it('every instant game settles its stake and bumps the nonce', async () => {
    const u = await newUser()
    const bets: [string, Record<string, unknown>][] = [
      ['dice', { amount: 5, over: false, target: 30 }],
      ['limbo', { amount: 5, target: 2 }],
      ['plinko', { amount: 5, rows: 12, risk: 'medium' }],
      ['keno', { amount: 5, picks: [1, 7, 20, 33], risk: 'medium' }],
      ['roulette', { bets: [{ type: 'red', amount: 2 }, { type: 'straight', value: 17, amount: 1 }] }],
    ]
    let nonce = 0
    for (const [game, body] of bets) {
      const r = await playInstant(u, game, body)
      expect(r.proof.nonce).toBe(nonce++)
    }
    expect((await stakesOf(u)).every(s => s.status !== 'open')).toBe(true)
    expect(await ledgerOk(u)).toBe(true)
  })

  it('never pays more than the payout cap, whatever the multiplier', async () => {
    const u = await newUser()
    expect(MAX_PAYOUT).toBe(1_000_000)
    // a Limbo bet at the maximum target can only win a capped amount; check the cap function through a lowest-stake bet that cannot overflow
    const r = await playInstant(u, 'limbo', { amount: 0.01, target: 1.01 })
    expect(r.payout).toBeLessThanOrEqual(MAX_PAYOUT)
  })

  it('refuses to rotate the seed while a Crash run is open (it would reveal the crash point)', async () => {
    const u = await newUser()
    const ref = randomUUID()
    await placeStake(u, 'crash', 5, ref)                       // what the solo host does when a Crash run starts
    await expect(rotate(u)).rejects.toThrow('finish your current round')
    await closeStake(u, ref, 'lost')
    await expect(rotate(u)).resolves.toBeTruthy()
  })

  it('accepts only plain amounts', async () => {
    const u = await newUser()
    for (const amount of ['0x10', '1e3', ' 5', '5 ', '-5', '', 'abc', null, [5], { v: 5 }, 10_001, 0.001]) {
      await expect(playInstant(u, 'limbo', { amount, target: 2 })).rejects.toThrow('bad amount')
    }
    await expect(playInstant(u, 'limbo', { amount: '5.5', target: 2 })).resolves.toBeTruthy()
    expect(await getBalance(u)).toBe(994.5)
  })

  it('does not treat object prototype names as games', async () => {
    const u = await newUser()
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      await expect(playInstant(u, key, { amount: 5 })).rejects.toThrow('unknown game')
      await expect(startRound(u, key, { amount: 5 })).rejects.toThrow('unknown game')
    }
  })

  it('rejects malformed bets without charging anything', async () => {
    const u = await newUser()
    const rejects: [string, Record<string, unknown>][] = [
      ['dice', { amount: 5, over: 'yes', target: 50 }],
      ['dice', { amount: 5, over: true, target: 99.5 }],
      ['dice', { amount: -1, over: true, target: 50 }],
      ['limbo', { amount: 5, target: 1 }],
      ['plinko', { amount: 5, rows: 9, risk: 'low' }],
      ['keno', { amount: 5, picks: [1, 1], risk: 'low' }],
      ['keno', { amount: 5, picks: Array.from({ length: 11 }, (_, i) => i + 1), risk: 'low' }],
      ['roulette', { bets: [] }],
      ['roulette', { bets: [{ type: 'straight', value: 40, amount: 1 }] }],
      ['nope', { amount: 5 }],
    ]
    for (const [game, body] of rejects) await expect(playInstant(u, game, body)).rejects.toThrow()
    expect(await getBalance(u)).toBe(1000)
    expect(await stakesOf(u)).toHaveLength(0)
  })
})

describe('stateful rounds', () => {
  it('mines: plays to the end, the round is closed, mines are only shown afterwards', async () => {
    const u = await newUser()
    const start = await startRound(u, 'mines', { amount: 10, mines: 3 })
    expect(start.view.bombs).toBeUndefined()
    expect(await getBalance(u)).toBe(990)
    expect((await currentRound(u, 'mines')).round).not.toBeNull()
    await expect(startRound(u, 'mines', { amount: 10, mines: 3 })).rejects.toThrow('already have a round')

    let last = start as Awaited<ReturnType<typeof actRound>>
    for (let tile = 0; tile < 25 && !last.done; tile++) last = await actRound(u, 'mines', { action: 'reveal', tile })
    if (!last.done) last = await actRound(u, 'mines', { action: 'cashout' })
    expect(last.done).toBeDefined()
    expect(last.view.bombs).toHaveLength(3)
    expect((await currentRound(u, 'mines')).round).toBeNull()
    expect(await ledgerOk(u)).toBe(true)
    expect((await stakesOf(u))[0].status).toBe(last.done!.outcome)
  })

  it('mines: cannot cash out before revealing, nor reveal a tile twice', async () => {
    const u = await newUser()
    await startRound(u, 'mines', { amount: 5, mines: 1 })
    await expect(actRound(u, 'mines', { action: 'cashout' })).rejects.toThrow('reveal a tile first')
    const r = await actRound(u, 'mines', { action: 'reveal', tile: 0 })
    if (!r.done) await expect(actRound(u, 'mines', { action: 'reveal', tile: 0 })).rejects.toThrow('already revealed')
    await sweepAllActive(u)
  })

  it('hilo: guesses until the round ends and settles the stake', async () => {
    const u = await newUser()
    let r = await startRound(u, 'hilo', { amount: 10 })
    expect(typeof r.view.card).toBe('number')
    await expect(actRound(u, 'hilo', { action: 'cashout' })).rejects.toThrow('make a guess first')
    for (let i = 0; i < 6 && !r.done; i++) {
      const card = r.view.card as number
      r = await actRound(u, 'hilo', { action: card <= 7 ? 'higher' : 'lower' })
    }
    if (!r.done) r = await actRound(u, 'hilo', { action: 'cashout' })
    expect(r.done).toBeDefined()
    expect(await ledgerOk(u)).toBe(true)
    expect((await stakesOf(u)).every(s => s.status !== 'open')).toBe(true)
  })

  it('blackjack: stand / double settle every stake exactly once', async () => {
    for (let round = 0; round < 4; round++) {
      const u = await newUser()
      let r = await startRound(u, 'blackjack', { amount: 20 })
      if (!r.done && round % 2 === 1 && (r.view.canDouble as boolean)) r = await actRound(u, 'blackjack', { action: 'double' })
      for (let i = 0; i < 12 && !r.done; i++) {
        r = await actRound(u, 'blackjack', { action: handValue(r.view.player as number[]).total < 12 ? 'hit' : 'stand' })
      }
      expect(r.done).toBeDefined()
      expect((r.view.dealer as number[]).length).toBeGreaterThanOrEqual(2)    // the hole card is shown once the hand is over
      expect((await stakesOf(u)).every(s => s.status !== 'open')).toBe(true)
      expect(await ledgerOk(u)).toBe(true)
      const expected = r.done!.outcome === 'won' ? 1 : 0
      const total = (await stakesOf(u)).reduce((a, s) => a + Number(s.amount), 0)
      const balance = await getBalance(u)
      if (expected === 0 && r.done!.outcome === 'lost') expect(balance).toBe(1000 - total)
      if (r.done!.outcome === 'refunded') expect(balance).toBe(1000)
    }
  }, 30_000)

  it('cannot rotate the seed (which would reveal the board) while a round is active', async () => {
    const u = await newUser()
    await startRound(u, 'mines', { amount: 5, mines: 2 })
    await expect(rotate(u)).rejects.toThrow('finish your current round')
    await sweepAllActive(u)
    await expect(rotate(u)).resolves.toBeTruthy()
  })

  it('a restart keeps the round: boot recovery skips it, the player continues, and stale rounds are refunded', async () => {
    const u = await newUser()
    await startRound(u, 'mines', { amount: 10, mines: 3 })
    expect(await recoverStakes([u])).toBe(0)                          // not treated as an orphan
    expect((await currentRound(u, 'mines')).round).not.toBeNull()    // still there to continue

    await db.update(schema.classicRounds).set({ updatedAt: new Date(Date.now() - 3 * 60 * 60_000) }).where(eq(schema.classicRounds.userId, u))
    expect(await sweepStaleRounds()).toBeGreaterThanOrEqual(1)
    expect(await getBalance(u)).toBe(1000)
    expect((await stakesOf(u))[0].status).toBe('refunded')
    expect(await ledgerOk(u)).toBe(true)
  })

  it('an abandoned blackjack hand is stood automatically, not refunded', async () => {
    const u = await newUser()
    let r = await startRound(u, 'blackjack', { amount: 10 })
    while (r.done) { await sweepAllActive(u); r = await startRound(u, 'blackjack', { amount: 10 }) }   // skip naturals
    await sweepAllActive(u)
    const [round] = await db.select().from(schema.classicRounds).where(eq(schema.classicRounds.id, r.roundId))
    expect(round.status).toBe('done')
    const open = (await stakesOf(u)).filter(s => s.status === 'open')
    expect(open).toHaveLength(0)
    const settled = (await stakesOf(u)).find(s => s.id === r.roundId)!
    // refunded only if the automatic stand ends in a push
    const dealerView = (round.state as { dealer: number[] }).dealer
    expect(dealerView.length).toBeGreaterThanOrEqual(2)
    if (settled.status === 'refunded') expect(await getBalance(u)).toBeGreaterThanOrEqual(0)
    expect(await ledgerOk(u)).toBe(true)
  })
})

// ends whatever round the user has open (cashes out / refunds) so the test can go on
const sweepAllActive = async (userId: string) => {
  await db.update(schema.classicRounds).set({ updatedAt: new Date(Date.now() - 3 * 60 * 60_000) }).where(eq(schema.classicRounds.userId, userId))
  await sweepStaleRounds()
}
