-- ============================================================
-- LILY GOURMET — Permission « Voir l'onglet Vitrine Salé »
-- À exécuter dans Supabase SQL Editor (1 fois). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_vitrine_sale BOOLEAN DEFAULT false;
