-- ===========================================================================
-- Live streaming v2 — rooms, engagement, immutable gift ledger, moderation.
-- Safe to re-run (IF NOT EXISTS everywhere).
-- ===========================================================================

ALTER TABLE creators ADD COLUMN IF NOT EXISTS live_wallpaper_url TEXT;

-- --------------------------------------------------------------------------
-- LiveRooms
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_streams (
  id            TEXT PRIMARY KEY,
  creator_id    UUID,
  handle        TEXT,
  title         TEXT,
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  status        TEXT DEFAULT 'live',
  nuts_earned   INTEGER DEFAULT 0
);

ALTER TABLE mm_live_streams ADD COLUMN IF NOT EXISTS peak_viewers  INTEGER DEFAULT 0;
ALTER TABLE mm_live_streams ADD COLUMN IF NOT EXISTS total_viewers INTEGER DEFAULT 0;
ALTER TABLE mm_live_streams ADD COLUMN IF NOT EXISTS likes         INTEGER DEFAULT 0;
ALTER TABLE mm_live_streams ADD COLUMN IF NOT EXISTS gift_count    INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_live_streams_status  ON mm_live_streams (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_streams_creator ON mm_live_streams (creator_id, started_at DESC);

-- --------------------------------------------------------------------------
-- LiveViewers — session-level presence rollup. Written on leave, NOT per tick;
-- realtime counts live in memory and never touch the database.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_viewers (
  id           BIGSERIAL PRIMARY KEY,
  live_id      TEXT NOT NULL,
  viewer_key   TEXT,
  username     TEXT,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  left_at      TIMESTAMPTZ,
  watch_ms     INTEGER DEFAULT 0,
  country      TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_viewers_live ON mm_live_viewers (live_id);

-- --------------------------------------------------------------------------
-- LiveComments — only persisted for moderation review / appeals.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_comments (
  id          TEXT PRIMARY KEY,
  live_id     TEXT NOT NULL,
  sender_key  TEXT,
  username    TEXT,
  text        TEXT,
  filtered    BOOLEAN DEFAULT FALSE,
  deleted_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_comments_live ON mm_live_comments (live_id, created_at DESC);

-- --------------------------------------------------------------------------
-- LiveReactions — aggregate buckets, never one row per tap.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_reactions (
  id          BIGSERIAL PRIMARY KEY,
  live_id     TEXT NOT NULL,
  bucket_at   TIMESTAMPTZ DEFAULT NOW(),
  count       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_reactions_live ON mm_live_reactions (live_id, bucket_at DESC);

-- --------------------------------------------------------------------------
-- GiftTransactions — APPEND ONLY. No UPDATE, no DELETE: corrections are new
-- rows. `nonce` is the client-supplied idempotency key; the unique index is
-- what makes a replayed gift request impossible to double-charge.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_gift_tx (
  id                  TEXT PRIMARY KEY,
  live_id             TEXT NOT NULL,
  nonce               TEXT,
  sender_key          TEXT NOT NULL,
  sender_name         TEXT,
  receiver_creator_id UUID,
  gift_id             TEXT NOT NULL,
  gift_name           TEXT,
  coin_cost           INTEGER NOT NULL CHECK (coin_cost >= 0),
  creator_share       INTEGER NOT NULL CHECK (creator_share >= 0),
  combo_count         INTEGER DEFAULT 1,
  target_side         TEXT DEFAULT 'A',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_gift_nonce
  ON mm_live_gift_tx (sender_key, nonce) WHERE nonce IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gift_tx_live     ON mm_live_gift_tx (live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_receiver ON mm_live_gift_tx (receiver_creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender   ON mm_live_gift_tx (sender_key, created_at DESC);

-- Hard guarantee of immutability at the database layer.
CREATE OR REPLACE FUNCTION mm_block_gift_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'mm_live_gift_tx is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gift_tx_immutable ON mm_live_gift_tx;
CREATE TRIGGER trg_gift_tx_immutable
  BEFORE UPDATE OR DELETE ON mm_live_gift_tx
  FOR EACH ROW EXECUTE FUNCTION mm_block_gift_mutation();

-- --------------------------------------------------------------------------
-- GiftReceipts — per-creator payout rollup, derived from the ledger.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_gift_receipts (
  id          BIGSERIAL PRIMARY KEY,
  live_id     TEXT NOT NULL,
  creator_id  UUID,
  gross_coins INTEGER DEFAULT 0,
  net_coins   INTEGER DEFAULT 0,
  gift_count  INTEGER DEFAULT 0,
  settled_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receipts_creator ON mm_live_gift_receipts (creator_id, settled_at DESC);

-- --------------------------------------------------------------------------
-- LiveModerators
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_moderators (
  id          BIGSERIAL PRIMARY KEY,
  creator_id  UUID NOT NULL,
  mod_key     TEXT NOT NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (creator_id, mod_key)
);

-- --------------------------------------------------------------------------
-- LiveReports
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_reports (
  id              TEXT PRIMARY KEY,
  live_id         TEXT NOT NULL,
  creator_id      UUID,
  target_username TEXT,
  reason          TEXT,
  note            TEXT,
  reporter_key    TEXT,
  resolved        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_reports_open ON mm_live_reports (resolved, created_at DESC);

-- --------------------------------------------------------------------------
-- LiveAnalytics — one row per finished live.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_live_analytics (
  live_id        TEXT PRIMARY KEY,
  creator_id     UUID,
  duration_ms    BIGINT DEFAULT 0,
  peak_viewers   INTEGER DEFAULT 0,
  total_viewers  INTEGER DEFAULT 0,
  likes          INTEGER DEFAULT 0,
  comments       INTEGER DEFAULT 0,
  gift_count     INTEGER DEFAULT 0,
  coins_gross    INTEGER DEFAULT 0,
  coins_net      INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_analytics_creator ON mm_live_analytics (creator_id, created_at DESC);
