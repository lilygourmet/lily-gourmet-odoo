-- ============================================================
-- LILY GOURMET - Conversations : phrases types (reponses rapides)
-- Table commune a l'equipe (RIB, explications cake design, etc.).
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS quick_replies (
  id          BIGSERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  body        TEXT NOT NULL,
  ordre       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all quick_replies" ON quick_replies
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
