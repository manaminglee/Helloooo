/**
 * Drop quiz tables from Supabase (requires direct Postgres access).
 *
 * Setup (one-time):
 *   1. Supabase Dashboard → Project Settings → Database → Database password
 *   2. Add to .env:  SUPABASE_DB_PASSWORD=your_db_password
 *
 * Run:
 *   node scripts/drop-quiz-tables.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const password = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_URL;

async function main() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!match || !process.env.SUPABASE_DB_PASSWORD) {
      console.error(`
Cannot connect to Postgres — set one of:

  SUPABASE_DB_PASSWORD=...     (from Supabase → Settings → Database)
  DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-....supabase.co:5432/postgres

Or paste supabase_drop_quiz_tables.sql into Supabase → SQL Editor and run it there.
`);
      process.exit(1);
    }
    const ref = match[1];
    connectionString = `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    console.log('Installing pg driver...');
    require('child_process').execSync('npm install pg --no-save', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    pg = require('pg');
  }

  const sqlPath = path.join(__dirname, '..', 'supabase_drop_quiz_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected. Dropping quiz tables...\n');

  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter((s) => s && !/^SELECT\s+tablename/i.test(s));

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      await client.query(stmt);
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 70);
      console.log('OK:', preview);
    } catch (e) {
      if (e.message.includes('does not exist')) {
        console.log('Skip (already gone):', stmt.split('\n')[0]);
      } else {
        console.warn('Warn:', e.message);
      }
    }
  }

  const { rows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ILIKE '%quiz%'
    ORDER BY tablename
  `);
  await client.end();

  console.log('\nRemaining quiz tables:', rows.length ? rows.map((r) => r.tablename).join(', ') : '(none)');
  if (rows.length === 0) {
    console.log('Done — all quiz tables removed.');
  } else {
    console.log('Some tables remain — run supabase_drop_quiz_tables.sql manually for extras.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  console.error('\nTip: Use Supabase SQL Editor → paste supabase_drop_quiz_tables.sql');
  process.exit(1);
});
