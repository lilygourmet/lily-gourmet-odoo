-- ============================================================
-- Permission « Valider les ordres de fabrication dans Odoo ».
-- Action IRRÉVERSIBLE (consomme les composants, entre le produit fini en
-- stock) : réservée à la personne choisie par Layla.
-- À exécuter dans Supabase (SQL editor) AVANT le déploiement.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_valider_of BOOLEAN NOT NULL DEFAULT false;
