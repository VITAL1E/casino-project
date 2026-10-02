// Single source of truth for the DB shape. `npm run db:generate` (in
// server/) diffs this against server/drizzle/*.sql and writes a new
// migration; the server applies pending ones on boot (see db/index.ts).
import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, timestamp, numeric, bigserial, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),   // null for OAuth/wallet-only accounts
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const wallets = pgTable('wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 14, scale: 2 }).notNull().default('1000'),
})

// Append-only audit trail. Every debit/credit writes one row here in the
// same transaction as the wallet update — see server/wallet.ts.
export const ledger = pgTable('ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),   // positive = credit, negative = debit
  reason: text('reason').notNull(),   // 'signup_bonus' | 'reset' | 'bet' | 'payout' | 'refund' | 'adjustment' | 'reward'
  roundId: text('round_id'),
  balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  index('ledger_user_id_idx').on(t.userId, t.createdAt),
  // idempotency: one entry per (user, reason, ref) — see server/wallet.ts
  uniqueIndex('ledger_user_reason_ref_key').on(t.userId, t.reason, t.roundId).where(sql`${t.roundId} is not null`),
]))

// A stake that has been taken for a round / match / run and not settled yet. It is opened in the same
// transaction as the debit and closed in the same transaction as the payout (see server/stakes.ts), so
// anything still 'open' after a restart belonged to a game that no longer exists and is refunded.
export const stakes = pgTable('stakes', {
  id: text('id').primaryKey(),   // the wallet ref of the stake
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  status: text('status').notNull().default('open'),   // 'open' | 'won' | 'lost' | 'refunded'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, t => ([
  index('stakes_status_idx').on(t.status),
]))

// Provably fair seeds for the classic games (see server/classics/fair.ts). The server seed stays secret until the
// user rotates it; only its SHA-256 hash is shown while it is active. 'previous' holds the last revealed seed.
export const fairSeeds = pgTable('fair_seeds', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  serverSeed: text('server_seed').notNull(),
  serverSeedHash: text('server_seed_hash').notNull(),
  clientSeed: text('client_seed').notNull(),
  nonce: integer('nonce').notNull().default(0),
  previous: jsonb('previous'),
})

// A classic round that is still being played (Mines, HiLo, Blackjack). It is stored so it survives a restart:
// the stake stays open, and the player simply continues. Hidden state (mine positions, the shoe) lives here.
export const classicRounds = pgTable('classic_rounds', {
  id: text('id').primaryKey(),   // the stake ref
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  game: text('game').notNull(),
  bet: numeric('bet', { precision: 14, scale: 2 }).notNull(),
  state: jsonb('state').notNull(),
  proof: jsonb('proof').notNull(),   // { nonce, clientSeed, serverSeedHash } so the round can be verified later
  status: text('status').notNull().default('active'),   // 'active' | 'done'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  index('classic_rounds_user_idx').on(t.userId, t.status),
]))

// ---- rewards (see server/rewards/) ----
// Lifetime play stats per user; the VIP level is derived from 'wagered'.
export const playerStats = pgTable('player_stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  wagered: numeric('wagered', { precision: 16, scale: 2 }).notNull().default('0'),
  bets: integer('bets').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  biggestWin: numeric('biggest_win', { precision: 16, scale: 2 }).notNull().default('0'),
})

// Progress on one challenge for one period (a UTC day); claimedAt is set once the reward was paid.
export const challengeProgress = pgTable('challenge_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  challengeId: text('challenge_id').notNull(),
  period: text('period').notNull(),   // 'YYYY-MM-DD' (UTC)
  progress: numeric('progress', { precision: 14, scale: 2 }).notNull().default('0'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
}, t => ([
  uniqueIndex('challenge_progress_key').on(t.userId, t.challengeId, t.period),
]))

// VIP level-up rewards already paid out (one per user and level).
export const vipClaims = pgTable('vip_claims', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  level: text('level').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  uniqueIndex('vip_claims_key').on(t.userId, t.level),
]))

export const oauthAccounts = pgTable('oauth_accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),          // 'google' | 'discord' | ...
  providerUserId: text('provider_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  uniqueIndex('oauth_accounts_provider_id_key').on(t.provider, t.providerUserId),
  index('oauth_accounts_user_id_idx').on(t.userId),
]))

export const walletAccounts = pgTable('wallet_accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chain: text('chain').notNull(),   // 'ethereum' | 'solana'
  address: text('address').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  uniqueIndex('wallet_accounts_chain_address_key').on(t.chain, t.address),
  index('wallet_accounts_user_id_idx').on(t.userId),
]))

// Odds are snapshotted at bet time (never trust the client's number — the
// server re-reads its own cached odds before accepting a bet) so a payout
// can always be recomputed even after the upstream line moves.
export const sportsBets = pgTable('sports_bets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),          // upstream (odds API) event id
  sportKey: text('sport_key').notNull(),        // upstream sport key, e.g. 'soccer_epl'
  commenceTime: timestamp('commence_time', { withTimezone: true }).notNull(),
  homeTeam: text('home_team').notNull(),
  awayTeam: text('away_team').notNull(),
  selection: text('selection').notNull(),       // home_team | away_team | 'Draw'
  odds: numeric('odds', { precision: 10, scale: 3 }).notNull(),
  stake: numeric('stake', { precision: 14, scale: 2 }).notNull(),
  potentialPayout: numeric('potential_payout', { precision: 14, scale: 2 }).notNull(),
  status: text('status').notNull().default('pending'),   // pending | won | lost | void
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, t => ([
  index('sports_bets_user_id_idx').on(t.userId, t.createdAt),
  index('sports_bets_sport_key_idx').on(t.sportKey),
]))
