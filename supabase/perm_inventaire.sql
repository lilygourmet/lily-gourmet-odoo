-- ============================================================
-- Onglet « Inventaire annexe » : compter le stock réel de
-- WHPDX/Stock Prod annexe (#62) et le comparer à Odoo.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

-- 1) La permission
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_inventaire boolean NOT NULL DEFAULT false;

-- 2) Un comptage = une ligne. Clé = l'article Odoo, pour qu'un recomptage
--    remplace l'ancien chiffre au lieu de s'empiler.
CREATE TABLE IF NOT EXISTS inventaire_comptages (
  product_id   BIGINT PRIMARY KEY,          -- id du produit dans Odoo
  nom          TEXT NOT NULL,
  uom          TEXT,
  quantite     NUMERIC NOT NULL,
  qty_odoo     NUMERIC,                     -- ce qu'Odoo disait au moment du comptage
  compte_par   TEXT,                        -- qui a compté (nom affiché)
  compte_le    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Ce qui est en stock mais absent du catalogue Odoo.
CREATE TABLE IF NOT EXISTS inventaire_ajouts (
  id           BIGSERIAL PRIMARY KEY,
  nom          TEXT NOT NULL,
  uom          TEXT,
  quantite     NUMERIC NOT NULL,
  compte_par   TEXT,
  compte_le    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventaire_comptages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all inventaire_comptages" ON inventaire_comptages FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inventaire_ajouts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all inventaire_ajouts" ON inventaire_ajouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Yasmina compte l'inventaire
UPDATE profiles SET perm_inventaire = true WHERE username = 'yasmina';
