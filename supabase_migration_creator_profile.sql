-- ===========================================================================
-- Creator profile v2 — searchable 6-digit ID, richer profile, score, KYC.
-- Idempotent; safe to re-run.
-- ===========================================================================

ALTER TABLE creators ADD COLUMN IF NOT EXISTS creator_code   TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS display_name   TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS languages      TEXT[] DEFAULT '{}';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS interests      TEXT[] DEFAULT '{}';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS country        TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS verified       BOOLEAN DEFAULT FALSE;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMPTZ;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS kyc_status     TEXT DEFAULT 'none';
ALTER TABLE creators ADD COLUMN IF NOT EXISTS total_lives    INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS live_minutes   INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS gifts_received INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS score          INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS score_at       TIMESTAMPTZ;

-- The 6-digit public ID. Unique, never reused, never sequential (a sequential
-- id would leak how many creators exist and how fast the platform is growing).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_creator_code ON creators (creator_code) WHERE creator_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creators_score  ON creators (score DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_creators_search ON creators (LOWER(handle_name));

-- ---------------------------------------------------------------------------
-- KYC. Optional by design: with KYC_MODE=off this table simply stays empty.
--
-- No identity DOCUMENT is ever stored here — only the provider's reference and
-- its verdict. Holding scans of government ID carries real legal duties, so
-- the default build never takes custody of them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_creator_kyc (
  id            UUID PRIMARY KEY,
  creator_id    UUID NOT NULL,
  mode          TEXT NOT NULL,              -- manual | provider
  provider      TEXT,                       -- provider name when mode=provider
  provider_ref  TEXT,                       -- opaque reference at the provider
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|expired
  reviewer      TEXT,
  reason        TEXT,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kyc_creator ON mm_creator_kyc (creator_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_open    ON mm_creator_kyc (status) WHERE status = 'pending';
