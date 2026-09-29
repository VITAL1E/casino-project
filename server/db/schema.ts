// Single source of truth for the DB shape. `npm run db:generate` (in
// server/) diffs this against server/drizzle/*.sql and writes a new
// migration; the server applies pending ones on boot (see db/index.ts).
import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, timestamp, numeric, bigserial, uniqueIndex, index } from 'drizzle-orm/pg-core'

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
// same transaction as the wallet update — see server/store.ts.
export const ledger = pgTable('ledger', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),   // positive = credit, negative = debit
  reason: text('reason').notNull(),   // 'signup_bonus' | 'reset' | 'bet' | 'payout'
  roundId: text('round_id'),
  balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ([
  index('ledger_user_id_idx').on(t.userId, t.createdAt),
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
