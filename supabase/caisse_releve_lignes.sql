-- ============================================================
-- LILY GOURMET — Lignes de relevé non attribuées (pour rattachement manuel)
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS caisse_releve_lignes (
  key         TEXT PRIMARY KEY,         -- date|montant|libellé (anti-doublon)
  ligne_date  DATE,
  amount      NUMERIC(10,2),
  label       TEXT,
  type        TEXT,
  releve_url  TEXT,                      -- chemin du PDF (preuve)
  used_by     BIGINT,                    -- id de l'enveloppe rattachée (NULL = libre)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_releve_lignes_amount_free
  ON caisse_releve_lignes(amount) WHERE used_by IS NULL;

ALTER TABLE caisse_releve_lignes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all caisse_releve_lignes" ON caisse_releve_lignes
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
