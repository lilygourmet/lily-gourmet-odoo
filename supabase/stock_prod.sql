-- ============================================================
-- Stock Prod Vitrine / Annexe (articles SM- depuis Odoo, par lieu).
-- Catalogue : l'admin active les articles à montrer + règle le stock mini.
-- À exécuter AVANT le déploiement du code.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_prod_catalog (
  id            BIGSERIAL PRIMARY KEY,
  lieu          TEXT NOT NULL CHECK (lieu IN ('vitrine', 'annexe')),
  product_name  TEXT NOT NULL,
  actif         BOOLEAN NOT NULL DEFAULT false,
  stock_min     NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lieu, product_name)
);

CREATE INDEX IF NOT EXISTS stock_prod_catalog_lieu_idx ON stock_prod_catalog(lieu);

ALTER TABLE stock_prod_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_prod_catalog_all ON stock_prod_catalog;
CREATE POLICY stock_prod_catalog_all
  ON stock_prod_catalog
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Permissions (2 vues distinctes)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_stock_prod_vitrine BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_stock_prod_annexe  BOOLEAN DEFAULT false;
