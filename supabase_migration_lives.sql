-- Optional: persistent live wallpaper on creators
ALTER TABLE creators ADD COLUMN IF NOT EXISTS live_wallpaper_url TEXT;

-- Live session log (optional analytics)
CREATE TABLE IF NOT EXISTS mm_live_streams (
  id TEXT PRIMARY KEY,
  creator_id UUID,
  handle TEXT,
  title TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'live',
  nuts_earned INTEGER DEFAULT 0
);
