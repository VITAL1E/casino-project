-- Wallet hardening (see server/wallet.ts).
-- 1) Older rows reused a ref for several entries (e.g. every queue join used the same round id).
--    Keep the first one as-is and suffix the later duplicates with their row id so the unique index can be built.
UPDATE "ledger" AS l
SET "round_id" = l."round_id" || '#' || l."id"
WHERE l."round_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "ledger" AS o
    WHERE o."user_id" = l."user_id" AND o."reason" = l."reason" AND o."round_id" = l."round_id" AND o."id" < l."id"
  );--> statement-breakpoint
-- 2) Old "reset" rows stored the absolute new balance instead of the change. Record one adjustment per wallet
--    that does not equal its ledger so that balance = sum(ledger) holds from here on.
INSERT INTO "ledger" ("user_id", "amount", "reason", "round_id", "balance_after")
SELECT w."user_id", w."balance" - COALESCE(s."total", 0), 'adjustment', 'reconcile-0001', w."balance"
FROM "wallets" AS w
LEFT JOIN (SELECT "user_id", SUM("amount") AS "total" FROM "ledger" GROUP BY "user_id") AS s ON s."user_id" = w."user_id"
WHERE w."balance" <> COALESCE(s."total", 0);--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_user_reason_ref_key" ON "ledger" USING btree ("user_id","reason","round_id") WHERE "ledger"."round_id" is not null;
