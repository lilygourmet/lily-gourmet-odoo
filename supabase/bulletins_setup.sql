-- ============================================================
-- LILY GOURMET - Bulletins de paie
-- Stocke 1 page (= 1 employe) par bulletin, regroupe par periode (YYYY-MM).
-- Table + bucket Storage prive 'bulletins' + politiques (auth maison anon+auth).
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

-- 1. Table : une ligne par page/employe
CREATE TABLE IF NOT EXISTS bulletins_paie (
  id           BIGSERIAL PRIMARY KEY,
  period       TEXT NOT NULL,            -- 'YYYY-MM'
  label        TEXT NOT NULL,            -- nom lu sur le bulletin (corrigeable)
  matricule    TEXT,                     -- matricule lu (si trouve)
  storage_path TEXT NOT NULL,            -- chemin du PDF 1 page dans le bucket
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bulletins_period ON bulletins_paie(period);
CREATE INDEX IF NOT EXISTS idx_bulletins_label ON bulletins_paie(label);

ALTER TABLE bulletins_paie ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all bulletins_paie" ON bulletins_paie FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Bucket de stockage prive
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulletins', 'bulletins', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Politiques d'acces au bucket (upload + lecture + suppression)
DO $$ BEGIN
  CREATE POLICY "bulletins insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'bulletins');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bulletins select" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'bulletins');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bulletins delete" ON storage.objects
    FOR DELETE TO anon, authenticated USING (bucket_id = 'bulletins');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
