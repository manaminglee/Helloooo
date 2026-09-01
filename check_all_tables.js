/**
 * Check all Manamingle-required Supabase tables (not quiz / enterprise tables).
 * Usage: node check_all_tables.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/** Tables this app uses — does NOT include quiz/enterprise tables from other apps. */
const MANAMINGLE_TABLES = [
  'creators',
  'referral_logs',
  'withdrawals',
  'user_coins',
  'creator_logins',
  'admin_history',
  'activity_logs',
  'group_rooms',
  'coin_ledger',
  'gift_events',
  'audit_logs',
  'mm_trust_scores',
  'mm_reports',
  'mm_conversation_ratings',
  'mm_pro_users',
  'mm_audio_identities',
  'mm_audio_coin_ledger',
  'mm_audio_payments',
  'mm_consumed_payments',
  'referral_clicks',
  'creator_events',
  'creator_notifications',
  'creator_password_resets',
  'room_sessions',
];

async function checkAll() {
  console.log('Checking Manamingle tables only (quiz tables are from another app — see docs/SUPABASE.md)\n');
  let failed = 0;
  for (const table of MANAMINGLE_TABLES) {
    const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`✗ ${table}: ${error.message}`);
      failed += 1;
    } else {
      console.log(`✓ ${table}`);
    }
  }
  console.log('');
  if (failed) {
    console.log(`${failed} table(s) missing — run supabase_schema.sql in Supabase SQL Editor.`);
    process.exit(1);
  }
  console.log('All Manamingle tables present.');
}

checkAll();
