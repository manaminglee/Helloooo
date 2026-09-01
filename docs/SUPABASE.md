# Supabase for Manamingle (Helloooo)

## Why do I see quiz / enterprise tables?

Your `.env` **`SUPABASE_URL` points at a shared Supabase project** that already hosts **other apps** (quiz platform, enterprise org, tournaments, etc.).

**Manamingle does not create or use quiz tables.** A search of this repo finds zero references to `quiz`, `quizzes`, or `enterprise_org_*`.

Quiz-related tables in your project today (examples):

| Table | Source |
|-------|--------|
| `quizzes` | Other app |
| `active_quiz_sessions` | Other app |
| `quiz_completions` | Other app |
| `quiz_schedule` | Other app |
| `enterprise_org_quizzes` | Other app |

Manamingle only reads/writes the tables listed below.

---

## Tables Manamingle uses (24)

Run `node scripts/audit-supabase-tables.js` to verify these exist.

| Table | Purpose |
|-------|---------|
| `creators` | Creator accounts |
| `referral_logs` | Referral visits |
| `referral_clicks` | Referral link clicks |
| `withdrawals` | Creator payouts |
| `user_coins` | IP-based coin wallet (text/video) |
| `creator_logins` | Creator login audit |
| `admin_history` | Admin actions |
| `activity_logs` | Activity / registration |
| `creator_events` | Creator analytics |
| `creator_notifications` | In-app creator notifications |
| `creator_password_resets` | Password reset tokens |
| `group_rooms` | Group room metadata |
| `coin_ledger` | Coin movement journal |
| `gift_events` | Gift sends |
| `audit_logs` | Security audit trail |
| `room_sessions` | Room presence snapshots |
| `mm_trust_scores` | Trust scores |
| `mm_reports` | User reports |
| `mm_conversation_ratings` | Chat ratings |
| `mm_pro_users` | Pro subscription by IP |
| `mm_audio_identities` | Voice-room username + wallet |
| `mm_audio_coin_ledger` | Voice wallet journal |
| `mm_audio_payments` | Coin pack purchases |
| `mm_consumed_payments` | Payment idempotency |

---

## Recommended fix (clean database)

**Use a dedicated Supabase project for Manamingle only:**

1. [supabase.com](https://supabase.com) → **New project** (e.g. `manamingle-prod`)
2. SQL Editor → paste and run:
   - `supabase_schema.sql`
   - `supabase_migration_audio_identity.sql`
3. Copy **Project URL** + **service_role** key into `.env`:
   ```env
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
4. Restart the server
5. Verify:
   ```bash
   node scripts/audit-supabase-tables.js
   ```

You will only see Manamingle tables — no quiz clutter.

---

## If you keep the shared project

- **Safe:** Leave quiz tables alone (another app may depend on them).
- Manamingle will **ignore** quiz tables completely.
- Use `scripts/audit-supabase-tables.js` to confirm Manamingle tables are OK.

### Remove quiz tables (irreversible)

Only if you have **retired the quiz app** on this database:

1. **SQL Editor (easiest):** open `supabase_drop_quiz_tables.sql` → paste → Run
2. **Or CLI:** set `SUPABASE_DB_PASSWORD` in `.env`, then:
   ```bash
   node scripts/drop-quiz-tables.js
   ```

Tables removed: `quizzes`, `active_quiz_sessions`, `quiz_completions`, `quiz_schedule`, `enterprise_org_quizzes`.

**Do not** run this if any other live product still uses quiz features.

---

## Migrations (this repo only)

| File | What it creates |
|------|-----------------|
| `supabase_schema.sql` | Full Manamingle schema (no quiz) |
| `supabase_migration_audio_identity.sql` | Voice identity + audio wallet |

These files **never** create `quizzes` or related tables.
