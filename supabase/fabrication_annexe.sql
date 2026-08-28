-- ============================================================
-- Onglet « Fabrication Annexe » : le pâtissier dit combien de fois il a fait
-- une recette, à n'importe quel niveau (l'entremets ou l'un de ses morceaux).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_fabrication_annexe BOOLEAN NOT NULL DEFAULT false;

-- Le même journal sert aux deux ateliers ; on note lequel.
ALTER TABLE prod_fabrications
  ADD COLUMN IF NOT EXISTS atelier TEXT NOT NULL DEFAULT 'prod';

CREATE INDEX IF NOT EXISTS prod_fabrications_atelier_idx
  ON prod_fabrications (atelier, jour DESC);

-- Odoo remonte 109 articles à l'annexe : ceux que l'équipe ne fait jamais se
-- rangent ici pour ne plus encombrer l'écran. Rien n'est supprimé.
CREATE TABLE IF NOT EXISTS prod_masques (
  atelier TEXT NOT NULL,
  nom TEXT NOT NULL,
  cache_par UUID REFERENCES profiles(id),
  cache_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (atelier, nom)
);

ALTER TABLE prod_masques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prod_masques_all ON prod_masques;
CREATE POLICY prod_masques_all ON prod_masques
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
