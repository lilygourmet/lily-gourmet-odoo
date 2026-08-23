-- ============================================================
-- Onglet « Fabrication » : ce que l'équipe a coché comme FAIT.
-- Pour l'instant la coche vit dans l'app seulement (Odoo n'est pas touché) ;
-- la colonne odoo_valide est prête pour le jour où on validera l'OF dans Odoo.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS prod_of_faits (
  mo_name     TEXT PRIMARY KEY,          -- ex. WHLVP/MO/199695
  mo_id       INT,
  produit     TEXT,
  qty         NUMERIC,
  jour        DATE,                      -- date de fabrication prévue (pour l'historique)
  fait_par    UUID,
  fait_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  odoo_valide BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_prod_of_faits_jour ON prod_of_faits (jour);

ALTER TABLE prod_of_faits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all prod_of_faits" ON prod_of_faits FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
