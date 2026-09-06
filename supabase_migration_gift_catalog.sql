-- Optional overlay table. Runtime uses server/data/gift-catalog-overlay.json
-- if this table is not wired yet.

CREATE TABLE IF NOT EXISTS mm_gift_catalog (
  id text PRIMARY KEY,
  name text,
  cost integer,
  category text,
  rarity text,
  render_type text,
  scene text,
  thumbnail_url text,
  preview_url text,
  celebration_url text,
  sound_url text,
  duration_ms integer,
  enabled boolean DEFAULT true,
  sort_order integer,
  patch jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
