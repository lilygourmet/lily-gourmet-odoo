-- Prévisions vitrine du jour, saisies par la pâtissière (ex : Fraisier 10 pers → 5).
-- Le « réservé » n'est PAS stocké ici : il est compté en direct dans Odoo (commandes
-- du jour avec l'entrepôt « Réservation Vitrine »). Restant = qty_prevue − réservé.
CREATE TABLE IF NOT EXISTS vitrine_previsions (
  id          BIGSERIAL PRIMARY KEY,
  day         DATE NOT NULL,
  variant_id  BIGINT NOT NULL,         -- product.product Odoo (le produit + taille)
  label       TEXT NOT NULL,           -- ex : « Fraisier »
  size_label  TEXT,                    -- ex : « 10 personnes »
  qty_prevue  NUMERIC NOT NULL,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (day, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_vitrine_previsions_day ON vitrine_previsions(day);

ALTER TABLE vitrine_previsions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all vitrine_previsions" ON vitrine_previsions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
