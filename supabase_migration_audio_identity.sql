-- =============================================================================
-- Migration: Audio room identity, wallet, levels, Cashfree coin purchases
-- Run in Supabase SQL Editor (safe to re-run).
-- =============================================================================

-- 18. Voice-room identities (username + PIN hash, colored name, wallet, XP)
CREATE TABLE IF NOT EXISTS mm_audio_identities (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  name_color TEXT NOT NULL DEFAULT '#f472b6',
  coins INTEGER NOT NULL DEFAULT 25 CHECK (coins >= 0),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  peak_xp INTEGER NOT NULL DEFAULT 0 CHECK (peak_xp >= 0),
  gifts_received INTEGER NOT NULL DEFAULT 0 CHECK (gifts_received >= 0),
  coins_recharged INTEGER NOT NULL DEFAULT 0 CHECK (coins_recharged >= 0),
  register_ip TEXT,
  last_login_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mm_audio_identities_username_unique UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_mm_audio_identities_updated ON mm_audio_identities(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_audio_identities_coins ON mm_audio_identities(coins DESC);
CREATE INDEX IF NOT EXISTS idx_mm_audio_identities_xp ON mm_audio_identities(xp DESC);

ALTER TABLE mm_audio_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_audio_identities;
CREATE POLICY "Allow full access" ON mm_audio_identities
  FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 19. Audio wallet ledger (gifts, recharges, debits — keyed by voice username)
CREATE TABLE IF NOT EXISTS mm_audio_coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username_key TEXT NOT NULL REFERENCES mm_audio_identities(username_key) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_audio_coin_ledger_user_created
  ON mm_audio_coin_ledger(username_key, created_at DESC);

ALTER TABLE mm_audio_coin_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_audio_coin_ledger;
CREATE POLICY "Allow full access" ON mm_audio_coin_ledger
  FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 20. Coin pack purchases (Cashfree / test mode idempotency)
CREATE TABLE IF NOT EXISTS mm_audio_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref TEXT UNIQUE NOT NULL,
  username_key TEXT REFERENCES mm_audio_identities(username_key) ON DELETE SET NULL,
  package_id TEXT NOT NULL,
  coins_credited INTEGER NOT NULL DEFAULT 0,
  amount_inr INTEGER,
  provider TEXT NOT NULL DEFAULT 'test',
  order_id TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_audio_payments_user ON mm_audio_payments(username_key, created_at DESC);

ALTER TABLE mm_audio_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_audio_payments;
CREATE POLICY "Allow full access" ON mm_audio_payments
  FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 21. Payment idempotency (shared with Stripe/Razorpay/Cashfree)
CREATE TABLE IF NOT EXISTS mm_consumed_payments (
  ref TEXT PRIMARY KEY,
  provider TEXT,
  product TEXT,
  package_id TEXT,
  username_key TEXT,
  meta JSONB DEFAULT '{}',
  consumed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_consumed_payments_at ON mm_consumed_payments(consumed_at DESC);

ALTER TABLE mm_consumed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_consumed_payments;
CREATE POLICY "Allow full access" ON mm_consumed_payments
  FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 22. Extend gift_events for voice-room usernames
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_events' AND column_name = 'from_audio_username'
  ) THEN
    ALTER TABLE gift_events ADD COLUMN from_audio_username TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_events' AND column_name = 'to_audio_username'
  ) THEN
    ALTER TABLE gift_events ADD COLUMN to_audio_username TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gift_events_to_audio ON gift_events(to_audio_username, created_at DESC);

-- 23. Optional: audio username on IP coin ledger for cross-reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coin_ledger' AND column_name = 'audio_username'
  ) THEN
    ALTER TABLE coin_ledger ADD COLUMN audio_username TEXT;
  END IF;
END $$;

-- === End audio identity migration ===
