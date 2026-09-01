-- ManaMingle Supabase Schema
-- Run this in the Supabase SQL Editor to initialize the database tables.
--
-- IMPORTANT: This file creates ONLY Manamingle / Helloooo tables.
-- It does NOT create quiz tables (quizzes, quiz_completions, etc.).
-- If you see quiz tables in your Supabase dashboard, they come from another
-- app sharing the same project — see docs/SUPABASE.md.
-- For a clean setup, create a new Supabase project and run this file there.

-- 1. Creators Table
CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  handle_name TEXT UNIQUE NOT NULL,
  platform TEXT,
  profile_link TEXT,
  avatar_url TEXT, -- NEW: Creator profile support
  bio TEXT DEFAULT '', -- NEW: Creator profile support
  authorized_ips TEXT[] DEFAULT '{}',
  referral_code TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  coins_earned INTEGER DEFAULT 0,
  earnings_rs INTEGER DEFAULT 0,
  referral_count INTEGER DEFAULT 0,
  followers_count INTEGER DEFAULT 0, -- NEW: Follower tracking
  follower_ips TEXT[] DEFAULT '{}', -- NEW: Prevent duplicate follows
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Referral Logs Table
CREATE TABLE IF NOT EXISTS referral_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  visitor_ip TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Withdrawals Table
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  handle_name TEXT,
  amount INTEGER NOT NULL,
  amount_rs INTEGER DEFAULT 0, -- NEW: Backwards compatibility
  coins_spent INTEGER DEFAULT 0, -- NEW: Track coin consumption
  upi TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Coins Table (For persistence across restarts)
CREATE TABLE IF NOT EXISTS user_coins (
  ip TEXT PRIMARY KEY,
  coins INTEGER DEFAULT 30,
  last_claim BIGINT DEFAULT 0,
  streak INTEGER DEFAULT 1,
  last_claim_date TEXT,
  last_reward_claimed BIGINT DEFAULT 0, -- Timestamp of last payout
  active_seconds INTEGER DEFAULT 0, -- Current hour progress (0-3600)
  total_active_seconds INTEGER DEFAULT 0, -- Overall career time
  registered BOOLEAN DEFAULT FALSE, -- Hit the 3-minute hurdle
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Creator Login Logs Table (Auditability)
CREATE TABLE IF NOT EXISTS creator_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL,
  creator_id TEXT,
  ip TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Admin History Table (Auditability & Records)
CREATE TABLE IF NOT EXISTS admin_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Group Rooms Table (Persistence for specialized topics)
CREATE TABLE IF NOT EXISTS group_rooms (
  id TEXT PRIMARY KEY,
  interest TEXT NOT NULL,
  mode TEXT DEFAULT 'group_video',
  creator_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "Allow full access" ON creators;
DROP POLICY IF EXISTS "Allow full access" ON referral_logs;
DROP POLICY IF EXISTS "Allow full access" ON withdrawals;
DROP POLICY IF EXISTS "Allow full access" ON user_coins;
DROP POLICY IF EXISTS "Allow full access" ON creator_logins;
DROP POLICY IF EXISTS "Allow full access" ON admin_history;
DROP POLICY IF EXISTS "Allow full access" ON group_rooms;
DROP POLICY IF EXISTS "Allow service role access" ON creators;
DROP POLICY IF EXISTS "Allow service role access" ON referral_logs;
DROP POLICY IF EXISTS "Allow service role access" ON withdrawals;
DROP POLICY IF EXISTS "Allow service role access" ON user_coins;
DROP POLICY IF EXISTS "Allow service role access" ON creator_logins;
DROP POLICY IF EXISTS "Allow service role access" ON admin_history;
DROP POLICY IF EXISTS "Allow service role access" ON group_rooms;

-- Enable RLS on group_rooms before policies
ALTER TABLE group_rooms ENABLE ROW LEVEL SECURITY;

-- Policy: Allow ALL operations (server uses service_role key which bypasses RLS anyway)
CREATE POLICY "Allow full access" ON creators FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON referral_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON withdrawals FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON user_coins FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON creator_logins FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON admin_history FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access" ON group_rooms FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 7. Delta/Migration Patches (Safe to run multiple times)
DO $$ 
BEGIN 
    -- 1. Add missing Creator columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='avatar_url') THEN
        ALTER TABLE creators ADD COLUMN avatar_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='bio') THEN
        ALTER TABLE creators ADD COLUMN bio TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='followers_count') THEN
        ALTER TABLE creators ADD COLUMN followers_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='follower_ips') THEN
        ALTER TABLE creators ADD COLUMN follower_ips TEXT[] DEFAULT '{}';
    END IF;

    -- 2. Add missing Economic columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='last_reward_claimed') THEN
        ALTER TABLE user_coins ADD COLUMN last_reward_claimed BIGINT DEFAULT 0;
    ELSE
        -- Fix: Drop default first to avoid casting errors if previous default was incompatible
        ALTER TABLE user_coins ALTER COLUMN last_reward_claimed DROP DEFAULT;
        ALTER TABLE user_coins ALTER COLUMN last_reward_claimed TYPE BIGINT USING (CASE WHEN last_reward_claimed::text = 'true' THEN EXTRACT(EPOCH FROM NOW())::BIGINT ELSE 0 END);
        ALTER TABLE user_coins ALTER COLUMN last_reward_claimed SET DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='active_seconds') THEN
        ALTER TABLE user_coins ADD COLUMN active_seconds INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='total_active_seconds') THEN
        ALTER TABLE user_coins ADD COLUMN total_active_seconds INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='registered') THEN
        ALTER TABLE user_coins ADD COLUMN registered BOOLEAN DEFAULT FALSE;
    END IF;

    -- 3. Add missing Withdrawal columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='amount_rs') THEN
        ALTER TABLE withdrawals ADD COLUMN amount_rs INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='coins_spent') THEN
        ALTER TABLE withdrawals ADD COLUMN coins_spent INTEGER DEFAULT 0;
    END IF;

    -- Standard maintenance migrations from original file
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='authorized_ips') THEN
        ALTER TABLE creators ADD COLUMN authorized_ips TEXT[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='password') THEN
        ALTER TABLE creators ADD COLUMN password TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='earnings_rs') THEN
        ALTER TABLE creators ADD COLUMN earnings_rs INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='referral_count') THEN
        ALTER TABLE creators ADD COLUMN referral_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='coins_earned') THEN
        ALTER TABLE creators ADD COLUMN coins_earned INTEGER DEFAULT 0;
    END IF;

    -- Fix ID column types if they were accidentally set to UUID
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='creators' AND column_name='id') <> 'text' THEN
        ALTER TABLE referral_logs DROP CONSTRAINT IF EXISTS referral_logs_creator_id_fkey;
        ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_creator_id_fkey;
        ALTER TABLE creators ALTER COLUMN id TYPE TEXT;
        ALTER TABLE referral_logs ALTER COLUMN creator_id TYPE TEXT;
        ALTER TABLE withdrawals ALTER COLUMN creator_id TYPE TEXT;
        ALTER TABLE referral_logs ADD CONSTRAINT referral_logs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
        ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
    END IF;

    -- Fix user_coins columns if any are missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='last_claim_date') THEN
        ALTER TABLE user_coins ADD COLUMN last_claim_date TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_coins' AND column_name='streak') THEN
        ALTER TABLE user_coins ADD COLUMN streak INTEGER DEFAULT 1;
    END IF;

    -- Cleanup: Ensure ANY unrecognized column is NULLABLE
    DECLARE
        col_rec RECORD;
    BEGIN
        FOR col_rec IN 
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'creators' 
              AND is_nullable = 'NO' 
              AND column_name NOT IN ('id', 'handle_name', 'created_at')
        LOOP
            EXECUTE format('ALTER TABLE creators ALTER COLUMN %I DROP NOT NULL', col_rec.column_name);
        END LOOP;
    END;
END $$;

-- 6. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  details TEXT, -- ADDED details for better auditability
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON activity_logs;
DROP POLICY IF EXISTS "Allow authenticated read on activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow server-side insert on activity_logs" ON activity_logs;

CREATE POLICY "Allow full access" ON activity_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 8. Creator Events Table (tips, referrals, follows — dashboard analytics)
CREATE TABLE IF NOT EXISTS creator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  details TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_events_creator_created ON creator_events(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_events_type ON creator_events(event_type);

ALTER TABLE creator_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON creator_events;
CREATE POLICY "Allow full access" ON creator_events FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 9. Creator security & analytics columns (safe re-run)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='password_hash') THEN
        ALTER TABLE creators ADD COLUMN password_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='tips_received_total') THEN
        ALTER TABLE creators ADD COLUMN tips_received_total INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='featured') THEN
        ALTER TABLE creators ADD COLUMN featured BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='rejection_reason') THEN
        ALTER TABLE creators ADD COLUMN rejection_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='admin_note') THEN
        ALTER TABLE withdrawals ADD COLUMN admin_note TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='processed_at') THEN
        ALTER TABLE withdrawals ADD COLUMN processed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='amount') THEN
        ALTER TABLE withdrawals ADD COLUMN amount INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='email') THEN
        ALTER TABLE creators ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='creators' AND column_name='preferred_upi') THEN
        ALTER TABLE creators ADD COLUMN preferred_upi TEXT DEFAULT '';
    END IF;
END $$;

-- 10. Creator password reset tokens
CREATE TABLE IF NOT EXISTS creator_password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_password_resets_token ON creator_password_resets(token);

ALTER TABLE creator_password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON creator_password_resets;
CREATE POLICY "Allow full access" ON creator_password_resets FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 11. Creator in-app notifications (admin actions, approvals, payouts)
CREATE TABLE IF NOT EXISTS creator_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  important BOOLEAN DEFAULT TRUE,
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_notifications_creator_created ON creator_notifications(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_notifications_unread ON creator_notifications(creator_id, read) WHERE read = FALSE;

ALTER TABLE creator_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON creator_notifications;
CREATE POLICY "Allow full access" ON creator_notifications FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- End of ManaMingle Supabase Schema

-- === Migration: trust/reports/ratings/pro/referral-clicks (server feature parity) ===
-- These tables are written by server/persistence.js and server/enhancements.js.
-- Run this section against existing deployments to close the schema drift.

-- 12. Trust scores (keyed by salted IP hash; see persistence.js hashIp)
CREATE TABLE IF NOT EXISTS mm_trust_scores (
  ip_hash TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 50,
  sessions INTEGER NOT NULL DEFAULT 0,
  badges JSONB DEFAULT '[]',
  reports INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mm_trust_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_trust_scores;
CREATE POLICY "Allow full access" ON mm_trust_scores FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 13. Moderation reports (persistence.saveReport)
CREATE TABLE IF NOT EXISTS mm_reports (
  id TEXT PRIMARY KEY,
  reporter_ip TEXT,
  target_ip TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_reports_created ON mm_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_reports_target ON mm_reports(target_ip);

ALTER TABLE mm_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_reports;
CREATE POLICY "Allow full access" ON mm_reports FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 14. Conversation ratings 1-5 (persistence.saveRating / getReputationBoost)
CREATE TABLE IF NOT EXISTS mm_conversation_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_ip TEXT,
  target_ip TEXT,
  rating INTEGER NOT NULL,
  room_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_conversation_ratings_target ON mm_conversation_ratings(target_ip);

ALTER TABLE mm_conversation_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_conversation_ratings;
CREATE POLICY "Allow full access" ON mm_conversation_ratings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 15. Pro users by IP (persistence.getProStatus / activatePro / grantProSubscription)
CREATE TABLE IF NOT EXISTS mm_pro_users (
  ip TEXT PRIMARY KEY,
  is_pro BOOLEAN DEFAULT FALSE,
  pro_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mm_pro_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_pro_users;
CREATE POLICY "Allow full access" ON mm_pro_users FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- 16. Referral link clicks (enhancements.js POST /api/referral/click)
CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT REFERENCES creators(id) ON DELETE CASCADE,
  visitor_ip TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_creator ON referral_clicks(creator_id, created_at DESC);

ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON referral_clicks;
CREATE POLICY "Allow full access" ON referral_clicks FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 17. Platform architecture: Wallet ledger · Gifts · Audit (Postgres / Supabase)
-- Maps to: Redis (Match/Rooms/Limits) + Postgres (Wallet/Coins/Gifts/Users) + Audit Logs
-- =============================================================================

-- Coin wallet movement ledger (economy.js journal → durable)
CREATE TABLE IF NOT EXISTS coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_ledger_ip_created ON coin_ledger(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_reason ON coin_ledger(reason);

ALTER TABLE coin_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON coin_ledger;
CREATE POLICY "Allow full access" ON coin_ledger FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Gift events (validated gifts after debit)
CREATE TABLE IF NOT EXISTS gift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id TEXT NOT NULL,
  gift_name TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  from_socket_id TEXT,
  to_socket_id TEXT,
  from_user_id TEXT,
  to_user_id TEXT,
  from_ip TEXT,
  to_ip TEXT,
  channel_id TEXT,
  creator_earned INTEGER DEFAULT 0,
  blast BOOLEAN DEFAULT FALSE,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_events_created ON gift_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_events_channel ON gift_events(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_events_from_ip ON gift_events(from_ip, created_at DESC);

ALTER TABLE gift_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON gift_events;
CREATE POLICY "Allow full access" ON gift_events FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Security / admin audit trail (moderation.audit → durable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON audit_logs;
CREATE POLICY "Allow full access" ON audit_logs FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Voice / video room presence snapshots (optional durability; live state prefers Redis)
CREATE TABLE IF NOT EXISTS room_sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'pair', -- pair | audio | group_video
  topic TEXT,
  mode TEXT,
  member_count INTEGER DEFAULT 0,
  meta JSONB DEFAULT '{}',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_sessions_kind ON room_sessions(kind, opened_at DESC);

ALTER TABLE room_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON room_sessions;
CREATE POLICY "Allow full access" ON room_sessions FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- === End Migration ===

-- =============================================================================
-- 18. Audio room identity, wallet, levels, Cashfree coin purchases
-- (see supabase_migration_audio_identity.sql for standalone run)
-- =============================================================================

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
CREATE POLICY "Allow full access" ON mm_audio_identities FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS mm_audio_coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username_key TEXT NOT NULL REFERENCES mm_audio_identities(username_key) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mm_audio_coin_ledger_user_created ON mm_audio_coin_ledger(username_key, created_at DESC);

ALTER TABLE mm_audio_coin_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access" ON mm_audio_coin_ledger;
CREATE POLICY "Allow full access" ON mm_audio_coin_ledger FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

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
CREATE POLICY "Allow full access" ON mm_audio_payments FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

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
CREATE POLICY "Allow full access" ON mm_consumed_payments FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gift_events' AND column_name='from_audio_username') THEN
    ALTER TABLE gift_events ADD COLUMN from_audio_username TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gift_events' AND column_name='to_audio_username') THEN
    ALTER TABLE gift_events ADD COLUMN to_audio_username TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='coin_ledger' AND column_name='audio_username') THEN
    ALTER TABLE coin_ledger ADD COLUMN audio_username TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gift_events_to_audio ON gift_events(to_audio_username, created_at DESC);

