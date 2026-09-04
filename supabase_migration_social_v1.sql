-- ===========================================================================
-- Social graph + direct messages v1 — follows, conversations, messages.
-- Safe to re-run (IF NOT EXISTS everywhere).
--
-- Keys are namespaced strings so audio identities and creators share one graph:
--   audio:<username-lowercase>   — an audio / live identity
--   creator:<creator-id>         — a creator row
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Follows — directed edge follower -> target. isMutual = both directions.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_follows (
  follower_key TEXT NOT NULL,
  target_key   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_key, target_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_follow_pair   ON mm_follows (follower_key, target_key);
CREATE INDEX        IF NOT EXISTS idx_follow_target  ON mm_follows (target_key);
CREATE INDEX        IF NOT EXISTS idx_follow_follower ON mm_follows (follower_key);

-- --------------------------------------------------------------------------
-- Conversations — one row per unordered key pair (a_key <= b_key).
-- theme_id is a preset chat theme applied to the whole conversation.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_conversations (
  id         TEXT PRIMARY KEY,
  a_key      TEXT NOT NULL,
  b_key      TEXT NOT NULL,
  theme_id   TEXT DEFAULT 'default',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON mm_conversations (a_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON mm_conversations (b_key, updated_at DESC);

-- --------------------------------------------------------------------------
-- Messages — text | gift | image.
--   body      : text content, or the gift name for gift messages
--   gift_id   : catalog gift id when kind = 'gift'
--   image_url : https URL, data URL, or `dm-media/<path>` when kind = 'image'
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mm_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_key      TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'gift', 'image')),
  body            TEXT,
  gift_id         TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON mm_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON mm_messages (sender_key, created_at DESC);

-- --------------------------------------------------------------------------
-- Storage bucket for DM images.
--
-- The server uploads via createSignedUploadUrl into a bucket named `dm-media`.
-- Create it once in the Supabase dashboard (Storage -> New bucket -> `dm-media`)
-- or via SQL against the storage schema, e.g.:
--
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('dm-media', 'dm-media', false)
--   ON CONFLICT (id) DO NOTHING;
--
-- Keep it private; the server mints signed URLs. If no bucket is configured the
-- server falls back to inline, client-compressed data URLs stored in image_url.
-- --------------------------------------------------------------------------
