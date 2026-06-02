-- ============================================================
-- LILY GOURMET — « Payé pour LG par Nezha/Layla »
-- Quand Nezha/Layla paie des choses pour Lily Gourmet avec son propre argent.
-- Ça crée un CRÉDIT en leur faveur (LG leur doit) qui se déduit de ce qu'elles
-- doivent à Meriem (avances). À exécuter dans Supabase SQL Editor. Relançable.
-- ============================================================

CREATE TABLE IF NOT EXISTS caisse_lg_paiements_perso (
  id             BIGSERIAL PRIMARY KEY,
  beneficiary_id BIGINT NOT NULL REFERENCES caisse_destinataires(id),
  amount         NUMERIC(10,2) NOT NULL,
  note           TEXT,
  paid_date      DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_lg_paiements_benef ON caisse_lg_paiements_perso(beneficiary_id);

ALTER TABLE caisse_lg_paiements_perso ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all caisse_lg_paiements_perso" ON caisse_lg_paiements_perso
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
