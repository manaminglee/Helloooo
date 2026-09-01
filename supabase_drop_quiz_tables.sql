-- =============================================================================
-- DROP quiz-related tables (NOT used by Manamingle)
-- Safe to run on a project where quiz features are retired.
-- IRREVERSIBLE — back up first if you need quiz data.
--
-- Run in Supabase → SQL Editor, or:
--   node scripts/drop-quiz-tables.js
-- (requires SUPABASE_DB_PASSWORD in .env)
-- =============================================================================

-- Child / session tables first, then parents
DROP TABLE IF EXISTS public.active_quiz_sessions CASCADE;
DROP TABLE IF EXISTS public.quiz_completions CASCADE;
DROP TABLE IF EXISTS public.quiz_schedule CASCADE;
DROP TABLE IF EXISTS public.enterprise_org_quizzes CASCADE;
DROP TABLE IF EXISTS public.quizzes CASCADE;

-- Optional: drop quiz-specific views/functions if they exist (ignore errors)
DO $$
BEGIN
  EXECUTE 'DROP VIEW IF EXISTS public.quiz_leaderboard CASCADE';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP VIEW IF EXISTS public.active_quizzes CASCADE';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Verify removal (should return 0 rows)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename ILIKE '%quiz%'
ORDER BY tablename;
