-- ============================================================
-- Onglet « Fabrication Prod » : ce que l'équipe a fabriqué dans la journée.
-- Simple trace dans l'app — Odoo n'est pas touché.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_fabrication_prod BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS prod_fabrications (
  id BIGSERIAL PRIMARY KEY,
  jour DATE NOT NULL,
  article TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  fait_par UUID REFERENCES profiles(id),
  fait_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- une seule déclaration par article et par jour : on la corrige, on n'empile pas
  UNIQUE (jour, article)
);

CREATE INDEX IF NOT EXISTS prod_fabrications_jour_idx ON prod_fabrications (jour DESC);

ALTER TABLE prod_fabrications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prod_fabrications_all ON prod_fabrications;
CREATE POLICY prod_fabrications_all ON prod_fabrications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
