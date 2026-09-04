-- Secure creator sessions (opaque bearer tokens hashed at rest)
CREATE TABLE IF NOT EXISTS creator_sessions (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS creator_sessions_creator_id_idx ON creator_sessions (creator_id);
CREATE INDEX IF NOT EXISTS creator_sessions_token_hash_idx ON creator_sessions (token_hash);
CREATE INDEX IF NOT EXISTS creator_sessions_expires_idx ON creator_sessions (expires_at);

-- Ensure critical creator auth columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='password_hash') THEN
    ALTER TABLE creators ADD COLUMN password_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='email') THEN
    ALTER TABLE creators ADD COLUMN email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='preferred_upi') THEN
    ALTER TABLE creators ADD COLUMN preferred_upi TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='live_wallpaper_url') THEN
    ALTER TABLE creators ADD COLUMN live_wallpaper_url TEXT;
  END IF;
END $$;

-- Deduplicate emails before unique index (keep best row per lower(email)).
-- Winner priority: approved > pending > other, then has password_hash, then newest created_at.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email)
      ORDER BY
        CASE status
          WHEN 'approved' THEN 0
          WHEN 'pending' THEN 1
          ELSE 2
        END,
        CASE WHEN password_hash IS NOT NULL AND password_hash <> '' THEN 0 ELSE 1 END,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM creators
  WHERE email IS NOT NULL AND btrim(email) <> ''
)
UPDATE creators c
SET email = NULL
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- Unique email when present (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS creators_email_unique_idx
  ON creators (lower(email))
  WHERE email IS NOT NULL AND email <> '';
