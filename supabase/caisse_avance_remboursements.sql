-- ============================================================
-- LILY GOURMET — Remboursements PARTIELS d'avances
-- Une avance peut être remboursée en plusieurs fois, en espèces / virement
-- (argent qui revient à Meriem) OU en « achat LG » (baisse la dette sans cash).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS caisse_avance_remboursements (
  id            BIGSERIAL PRIMARY KEY,
  avance_id     UUID NOT NULL REFERENCES caisse_avances(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('especes', 'virement', 'achat_lg')),
  note          TEXT,
  rb_date       DATE,
  mouvement_id  BIGINT,   -- entrée créée dans la caisse Meriem (espèces/virement)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID
);

CREATE INDEX IF NOT EXISTS idx_avance_remb_avance ON caisse_avance_remboursements(avance_id);

ALTER TABLE caisse_avance_remboursements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all caisse_avance_remboursements" ON caisse_avance_remboursements
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
