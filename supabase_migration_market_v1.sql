-- Virtual economy market snapshots (Helloooo Platform Virtual Economy Rate)
-- Idempotent. Not a real FX market — internal accounting only.

CREATE TABLE IF NOT EXISTS mm_market_snapshots (
  id                 TEXT PRIMARY KEY,
  rate               NUMERIC(10,4) NOT NULL,
  previous_rate      NUMERIC(10,4),
  change             NUMERIC(10,4),
  change_percent     NUMERIC(10,4),
  status             TEXT,
  demand_score       NUMERIC(12,6),
  purchase_volume    BIGINT DEFAULT 0,
  gift_volume        BIGINT DEFAULT 0,
  withdrawal_volume  BIGINT DEFAULT 0,
  active_buyers      INTEGER DEFAULT 0,
  active_gifters     INTEGER DEFAULT 0,
  active_creators    INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_created
  ON mm_market_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS mm_market_purchases (
  id              TEXT PRIMARY KEY,
  audio_username  TEXT,
  package_id      TEXT,
  coins           INTEGER NOT NULL,
  currency        TEXT,
  amount_paid     NUMERIC(12,2),
  market_rate     NUMERIC(10,4) NOT NULL,
  provider        TEXT,
  provider_tx_id  TEXT,
  status          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_purchases_created
  ON mm_market_purchases (created_at DESC);

CREATE TABLE IF NOT EXISTS mm_market_gift_earnings (
  id                 TEXT PRIMARY KEY,
  gift_id            TEXT,
  live_id            TEXT,
  sender_key         TEXT,
  creator_id         TEXT,
  gift_coins         INTEGER NOT NULL,
  creator_share_pct  NUMERIC(6,4),
  creator_coins      INTEGER,
  platform_coins     INTEGER,
  market_rate        NUMERIC(10,4) NOT NULL,
  creator_inr        NUMERIC(12,2),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_gift_earnings_creator
  ON mm_market_gift_earnings (creator_id, created_at DESC);

-- Optional: store live config in DB (localDb remains fallback)
CREATE TABLE IF NOT EXISTS mm_market_config (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
