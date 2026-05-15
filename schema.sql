-- ============================================================
-- DevTracker — Supabase Database Schema
-- ============================================================
-- Run this ONCE in your Supabase SQL Editor:
--   https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- 1. Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    remote_url  TEXT UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.heartbeats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    language    TEXT,
    file_path   TEXT,
    branch      TEXT,
    editor      TEXT,
    os          TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_stats (
    user_id           UUID NOT NULL,
    date              DATE NOT NULL,
    total_seconds     INTEGER DEFAULT 0,
    primary_language  TEXT,
    updated_at        TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, date)
);

-- 2. Indexes (query performance) ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_heartbeats_user_created
    ON public.heartbeats (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_heartbeats_project
    ON public.heartbeats (project_id);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date
    ON public.daily_stats (user_id, date DESC);

-- 3. Row Level Security ──────────────────────────────────────
--    Since this is a PRIVATE tracker, we allow all operations.
--    If you want per-user isolation later, replace these with
--    policies that check auth.uid().

ALTER TABLE public.projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running this script
DO $$ BEGIN
    DROP POLICY IF EXISTS "devtracker_all" ON public.projects;
    DROP POLICY IF EXISTS "devtracker_all" ON public.heartbeats;
    DROP POLICY IF EXISTS "devtracker_all" ON public.daily_stats;
END $$;

CREATE POLICY "devtracker_all" ON public.projects
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "devtracker_all" ON public.heartbeats
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "devtracker_all" ON public.daily_stats
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Permissions ─────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.projects    TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.heartbeats  TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_stats TO anon, authenticated, service_role;
