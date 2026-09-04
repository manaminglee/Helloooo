-- ===========================================================================
-- Multi-tenant agencies (v1)
--
-- Adds the agency layer: each agency owns a creator roster, a set of members,
-- invite codes that grant instant live access, a mintable Nuts pool, and a
-- commission ledger.
--
-- localDb (server/data/manadb.json) stays the runtime source of truth; these
-- tables are the durable mirror so agency state survives a redeploy.
--
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Agencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | suspended

  -- Only the hash is stored; the plaintext key is shown once at creation.
  key_hash TEXT NOT NULL,
  key_rotated_at TIMESTAMPTZ,

  -- Commission is a fraction of the PLATFORM's cut of a gift, never of the
  -- creator's share, so an affiliated creator earns exactly the same.
  commission_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.2000
    CONSTRAINT agencies_commission_pct_range CHECK (commission_pct >= 0 AND commission_pct <= 0.9),
  -- The owner's override is taken out of the recruiting member's slice.
  owner_override_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.1000
    CONSTRAINT agencies_owner_override_range CHECK (owner_override_pct >= 0 AND owner_override_pct <= 1),

  -- Mint: the pool drips continuously and the daily allowance compounds.
  mint_pool_nuts BIGINT NOT NULL DEFAULT 0 CHECK (mint_pool_nuts >= 0),
  mint_pool_cap BIGINT NOT NULL DEFAULT 5000000 CHECK (mint_pool_cap >= 0),
  mint_daily_allowance BIGINT NOT NULL DEFAULT 50000 CHECK (mint_daily_allowance >= 0),
  mint_growth_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0200
    CONSTRAINT agencies_mint_growth_range CHECK (mint_growth_pct >= 0 AND mint_growth_pct <= 0.25),
  mint_accrued_today BIGINT NOT NULL DEFAULT 0,
  mint_carry NUMERIC(20, 8) NOT NULL DEFAULT 0,  -- sub-Nut remainder, prevents drip drift
  mint_last_tick_at BIGINT,                      -- epoch ms of the last accrual
  mint_day_key TEXT,                             -- 'YYYY-MM-DD', detects rollover
  mint_days_elapsed INTEGER NOT NULL DEFAULT 0,
  mint_minted_total BIGINT NOT NULL DEFAULT 0,

  nuts_sold BIGINT NOT NULL DEFAULT 0,
  sales_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission_earned_nuts BIGINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agencies_status ON agencies (status);

-- ---------------------------------------------------------------------------
-- Members — owner plus recruiters who earn commission on their own signups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agency_members (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',        -- owner | member
  -- Share of the agency commission on creators this member recruited.
  commission_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.5000
    CONSTRAINT agency_members_commission_range CHECK (commission_pct >= 0 AND commission_pct <= 1),
  earned_nuts BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',      -- active | disabled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active login per email, or resolving a login would be ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_members_email_active
  ON agency_members (lower(email)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agency_members_agency ON agency_members (agency_id);

-- ---------------------------------------------------------------------------
-- Invites — the "direct access to live" path
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agency_invites (
  code TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  -- Who gets commission credit for creators who use this code.
  member_id TEXT REFERENCES agency_members(id) ON DELETE SET NULL,
  label TEXT,
  max_uses INTEGER NOT NULL DEFAULT 0,        -- 0 = unlimited
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_invites_agency ON agency_invites (agency_id);

-- ---------------------------------------------------------------------------
-- Commission / sale ledger (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agency_ledger (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES agency_members(id) ON DELETE SET NULL,
  creator_id TEXT,
  -- commission | owner_override | house | sale (sale is negative: Nuts leaving)
  kind TEXT NOT NULL,
  nuts BIGINT NOT NULL,
  gift_id TEXT,
  live_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_ledger_agency_time ON agency_ledger (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_ledger_member ON agency_ledger (member_id);
CREATE INDEX IF NOT EXISTS idx_agency_ledger_creator ON agency_ledger (creator_id);

-- ---------------------------------------------------------------------------
-- Nuts sold out of the mint pool into user wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agency_sales (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES agency_members(id) ON DELETE SET NULL,
  username_key TEXT NOT NULL,
  nuts BIGINT NOT NULL CHECK (nuts > 0),
  inr NUMERIC(14, 2),
  market_rate NUMERIC(14, 4),                 -- frozen at sale time
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_sales_agency_time ON agency_sales (agency_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Dashboard sessions for owner / member email+password login
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agency_sessions (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES agency_members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_sessions_token ON agency_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_agency_sessions_member ON agency_sessions (member_id);

-- ---------------------------------------------------------------------------
-- Bind creators to their agency and to the member who recruited them
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'creators' AND column_name = 'agency_id') THEN
    ALTER TABLE creators ADD COLUMN agency_id TEXT REFERENCES agencies(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'creators' AND column_name = 'agency_member_id') THEN
    ALTER TABLE creators ADD COLUMN agency_member_id TEXT REFERENCES agency_members(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'creators' AND column_name = 'agency_invite_code') THEN
    ALTER TABLE creators ADD COLUMN agency_invite_code TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'creators' AND column_name = 'agency_joined_at') THEN
    ALTER TABLE creators ADD COLUMN agency_joined_at TIMESTAMPTZ;
  END IF;
END $$;

-- The roster query is "every creator in this agency", so index that.
CREATE INDEX IF NOT EXISTS idx_creators_agency ON creators (agency_id);
CREATE INDEX IF NOT EXISTS idx_creators_agency_member ON creators (agency_member_id);

-- ---------------------------------------------------------------------------
-- RLS: every one of these tables holds credentials or money. The server talks
-- to Supabase with the service-role key, which bypasses RLS; enabling it with
-- no permissive policy means an anon/public key can read none of it.
-- ---------------------------------------------------------------------------
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_sessions ENABLE ROW LEVEL SECURITY;
