/**
 * Audit Supabase: which tables belong to Manamingle vs other apps on the same project.
 * Usage: node scripts/audit-supabase-tables.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const MANAMINGLE_TABLES = [
  'creators',
  'referral_logs',
  'referral_clicks',
  'withdrawals',
  'user_coins',
  'creator_logins',
  'admin_history',
  'activity_logs',
  'creator_events',
  'creator_notifications',
  'creator_password_resets',
  'group_rooms',
  'coin_ledger',
  'gift_events',
  'audit_logs',
  'room_sessions',
  'mm_trust_scores',
  'mm_reports',
  'mm_conversation_ratings',
  'mm_pro_users',
  'mm_audio_identities',
  'mm_audio_coin_ledger',
  'mm_audio_payments',
  'mm_consumed_payments',
];

const QUIZ_PATTERN = /quiz/i;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  const allTables = Object.keys(spec.paths || {})
    .filter((p) => p.startsWith('/') && p.length > 1 && !p.includes('rpc/'))
    .map((p) => p.slice(1))
    .sort();

  const quizTables = allTables.filter((t) => QUIZ_PATTERN.test(t));
  const manaminglePresent = [];
  const manamingleMissing = [];

  for (const table of MANAMINGLE_TABLES) {
    if (allTables.includes(table)) manaminglePresent.push(table);
    else manamingleMissing.push(table);
  }

  const foreignTables = allTables.filter(
    (t) => !MANAMINGLE_TABLES.includes(t) && !QUIZ_PATTERN.test(t)
  );

  console.log('=== Manamingle Supabase audit ===\n');
  console.log(`Project: ${url}`);
  console.log(`Total tables exposed via API: ${allTables.length}\n`);

  console.log(`Manamingle tables OK (${manaminglePresent.length}/${MANAMINGLE_TABLES.length}):`);
  for (const t of manaminglePresent) console.log(`  ✓ ${t}`);

  if (manamingleMissing.length) {
    console.log(`\nManamingle tables MISSING (run supabase_schema.sql):`);
    for (const t of manamingleMissing) console.log(`  ✗ ${t}`);
  }

  if (quizTables.length) {
    console.log(`\nQuiz tables (${quizTables.length}) — NOT from Manamingle; another app on this project:`);
    for (const t of quizTables) console.log(`  ⚠ ${t}`);
    console.log('\n  → See docs/SUPABASE.md — use a dedicated Supabase project or ignore these.');
  }

  if (foreignTables.length) {
    console.log(`\nOther foreign tables (${foreignTables.length}) — enterprise/tournament/etc., not Manamingle:`);
    console.log(`  ${foreignTables.slice(0, 12).join(', ')}${foreignTables.length > 12 ? '…' : ''}`);
  }

  console.log('');
  if (manamingleMissing.length) {
    console.log('Action: Run supabase_schema.sql + supabase_migration_audio_identity.sql in SQL Editor.');
    process.exit(1);
  }
  if (quizTables.length) {
    console.log('Manamingle schema is OK. Quiz tables are from a shared database — not a bug in this app.');
    process.exit(0);
  }
  console.log('Dedicated Manamingle database — all good.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
