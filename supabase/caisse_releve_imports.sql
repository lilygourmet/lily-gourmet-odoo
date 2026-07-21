-- ============================================================
-- LILY GOURMET — Trace des relevés bancaires importés (historique)
-- Une ligne par import : qui, quand, quels fichiers, quelle période, compteurs.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS caisse_releve_imports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  imported_at    TIMESTAMPTZ DEFAULT NOW(),
  imported_by    UUID REFERENCES profiles(id),
  files          TEXT,           -- noms des fichiers PDF (séparés par « , »)
  banks          TEXT,           -- banque(s) reconnue(s)
  period_start   DATE,           -- période couverte par le relevé (du…)
  period_end     DATE,           -- …au
  nb_trouve      INT DEFAULT 0,
  nb_a_confirmer INT DEFAULT 0,
  nb_absent      INT DEFAULT 0,
  nb_unmatched   INT DEFAULT 0,  -- lignes du relevé non attribuées
  recompute      BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_releve_imports_at
  ON caisse_releve_imports(imported_at DESC);

ALTER TABLE caisse_releve_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all caisse_releve_imports" ON caisse_releve_imports
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
