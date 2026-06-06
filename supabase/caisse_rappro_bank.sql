-- ============================================================
-- Relevé bancaire importé pour le RAPPROCHEMENT, PARTAGÉ entre tous les admins.
-- Avant, le relevé était mis en cache localement (IndexedDB) → l'autre admin
-- ne voyait pas le rapprochement. On le stocke maintenant en base (1 ligne).
-- À exécuter dans Supabase SQL Editor.
-- ============================================================
CREATE TABLE IF NOT EXISTS caisse_rappro_bank (
  id          TEXT PRIMARY KEY,
  data        JSONB,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE caisse_rappro_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caisse_rappro_bank_all ON caisse_rappro_bank;
CREATE POLICY caisse_rappro_bank_all ON caisse_rappro_bank
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
