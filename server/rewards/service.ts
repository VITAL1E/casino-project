import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { PublicError } from '../security'
import { getBalance, reward } from '../wallet'
import { CHALLENGES, TIERS, nextReset, periodOf, tierFor } from './defs'

const round2 = (n: number) => Math.round(n * 100) / 100

const wageredOf = async (userId: string) => {
  const [s] = await db.select({ wagered: schema.playerStats.wagered }).from(schema.playerStats).where(eq(schema.playerStats.userId, userId))
  return s ? Number(s.wagered) : 0
}

export const getVip = async (userId: string) => {
  const wagered = await wageredOf(userId)
  const claims = await db.select({ level: schema.vipClaims.level }).from(schema.vipClaims).where(eq(schema.vipClaims.userId, userId))
  const claimed = new Set(claims.map(c => c.level))
  const current = tierFor(wagered)
  const next = TIERS.find(t => t.min > wagered) ?? null
  return {
    wagered: round2(wagered),
    level: { key: current.key, name: current.name },
    next: next ? { key: next.key, name: next.name, min: next.min, remaining: round2(next.min - wagered) } : null,
    tiers: TIERS.map(t => ({ ...t, reached: wagered >= t.min, claimed: t.reward === 0 || claimed.has(t.key) })),
    claimable: round2(TIERS.filter(t => wagered >= t.min && t.reward > 0 && !claimed.has(t.key)).reduce((s, t) => s + t.reward, 0)),
  }
}

// Pays every level-up reward that has been reached and not yet claimed. Each one is paid at most once
// (unique claim row + an idempotent wallet ref), even when two requests arrive together.
export const claimVip = async (userId: string) => {
  const credited = await db.transaction(async tx => {
    await tx.insert(schema.playerStats).values({ userId }).onConflictDoNothing()
    const [stats] = await tx.select().from(schema.playerStats).where(eq(schema.playerStats.userId, userId)).for('update')
    const wagered = Number(stats.wagered)
    const claims = await tx.select({ level: schema.vipClaims.level }).from(schema.vipClaims).where(eq(schema.vipClaims.userId, userId))
    const claimed = new Set(claims.map(c => c.level))
    let total = 0
    for (const t of TIERS) {
      if (t.reward <= 0 || wagered < t.min || claimed.has(t.key)) continue
      await tx.insert(schema.vipClaims).values({ userId, level: t.key })
      await reward(userId, t.reward, `vip:${t.key}`, tx)
      total += t.reward
    }
    return total
  })
  return { credited, balance: await getBalance(userId) }
}

export const getChallenges = async (userId: string) => {
  const period = periodOf()
  const rows = await db.select().from(schema.challengeProgress)
    .where(and(eq(schema.challengeProgress.userId, userId), eq(schema.challengeProgress.period, period)))
  const byId = new Map(rows.map(r => [r.challengeId, r]))
  return {
    period,
    resetsAt: nextReset(),
    challenges: CHALLENGES.map(c => {
      const row = byId.get(c.id)
      const progress = row ? Number(row.progress) : 0
      return { id: c.id, title: c.title, metric: c.metric, target: c.target, reward: c.reward, progress: Math.min(c.target, round2(progress)), done: progress >= c.target, claimed: !!row?.claimedAt }
    }),
  }
}

export const claimChallenge = async (userId: string, id: string) => {
  const def = CHALLENGES.find(c => c.id === id)
  if (!def) throw new PublicError('unknown challenge')
  const period = periodOf()
  await db.transaction(async tx => {
    const [row] = await tx.select().from(schema.challengeProgress)
      .where(and(eq(schema.challengeProgress.userId, userId), eq(schema.challengeProgress.challengeId, id), eq(schema.challengeProgress.period, period)))
      .for('update')
    if (!row || Number(row.progress) < def.target) throw new PublicError('challenge not completed yet')
    if (row.claimedAt) throw new PublicError('reward already claimed')
    await tx.update(schema.challengeProgress).set({ claimedAt: new Date() })
      .where(and(eq(schema.challengeProgress.userId, userId), eq(schema.challengeProgress.challengeId, id), eq(schema.challengeProgress.period, period)))
    await reward(userId, def.reward, `challenge:${id}:${period}`, tx)
  })
  return { reward: def.reward, balance: await getBalance(userId) }
}
