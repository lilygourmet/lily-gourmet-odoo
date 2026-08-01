-- ============================================================
-- Conversion d'heures (sup / manquantes) en jours (récup / décompte).
-- Chaque conversion : crée une allocation dans conges_allocations (traçable)
-- ET enregistre ici les heures converties → calculerMois les RETIRE du solde
-- du mois (pas de double comptage : ni en heures, ni en jours).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS heures_conversions (
  id            BIGSERIAL PRIMARY KEY,
  employe_id    INT NOT NULL,
  mois          INT NOT NULL,
  annee         INT NOT NULL,
  sup_heures    NUMERIC NOT NULL DEFAULT 0,   -- heures sup converties en récup
  manq_heures   NUMERIC NOT NULL DEFAULT 0,   -- heures manquantes converties en décompte
  alloc_sup_id  BIGINT,                       -- allocation créée (récup +)
  alloc_manq_id BIGINT,                       -- allocation créée (décompte −)
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heures_conversions_mois ON heures_conversions (mois, annee);
CREATE INDEX IF NOT EXISTS idx_heures_conversions_emp  ON heures_conversions (employe_id);

ALTER TABLE heures_conversions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all heures_conversions" ON heures_conversions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
