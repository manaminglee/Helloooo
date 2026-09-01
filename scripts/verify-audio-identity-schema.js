/**
 * Verify (and guide) Supabase schema for audio identity features.
 * DDL must be run in Supabase SQL Editor — paste supabase_migration_audio_identity.sql
 *
 * Usage: node scripts/verify-audio-identity-schema.js
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

const REQUIRED_TABLES = [
  'mm_audio_identities',
  'mm_audio_coin_ledger',
  'mm_audio_payments',
  'mm_consumed_payments',
];

async function checkTable(name) {
  const { error } = await supabase.from(name).select('*', { count: 'exact', head: true });
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return { ok: false, missing: true, error: error.message };
    }
    return { ok: false, missing: false, error: error.message };
  }
  return { ok: true };
}

async function main() {
  console.log('Verifying audio identity Supabase schema...\n');
  let allOk = true;
  for (const table of REQUIRED_TABLES) {
    const res = await checkTable(table);
    if (res.ok) {
      console.log(`✓ ${table}`);
    } else if (res.missing) {
      console.log(`✗ ${table} — NOT FOUND`);
      allOk = false;
    } else {
      console.log(`? ${table} — ${res.error}`);
      allOk = false;
    }
  }

  const { error: giftColErr } = await supabase.from('gift_events').select('from_audio_username').limit(0);
  if (giftColErr?.message?.includes('from_audio_username')) {
    console.log('✗ gift_events.from_audio_username — column missing');
    allOk = false;
  } else {
    console.log('✓ gift_events audio username columns');
  }

  console.log('');
  if (allOk) {
    console.log('All audio identity tables are ready.');
    process.exit(0);
  }
  console.log('Run this file in Supabase → SQL Editor:');
  console.log('  supabase_migration_audio_identity.sql');
  console.log('Then re-run: node scripts/verify-audio-identity-schema.js');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
