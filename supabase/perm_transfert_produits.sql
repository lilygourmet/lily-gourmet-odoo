-- ============================================================
-- LILY GOURMET — Permission « Transferts Produits (SM) »
-- Qui peut utiliser l'onglet Transferts Produits (semi-finis).
-- L'atelier (Prod annexe / Prod boutique) reste donné par les deux permissions
-- existantes : celle-ci dit CE QU'ON PEUT transférer, l'atelier dit D'OÙ.
-- À exécuter dans Supabase (SQL editor) AVANT de déployer. Relançable sans risque.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_transfert_produits boolean NOT NULL DEFAULT false;
