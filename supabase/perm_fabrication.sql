-- ============================================================
-- Permissions des onglets de fabrication :
--   perm_fabrication_cd      → onglet « Fabrication CD » (voir + cocher « fait »)
--   perm_fabrication_glacage → onglet « Fabrication Glaçage »
-- (la validation dans Odoo reste perm_valider_of, déjà créée)
-- À exécuter dans Supabase (SQL editor) AVANT le déploiement.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_fabrication_cd      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_fabrication_glacage BOOLEAN NOT NULL DEFAULT false;
