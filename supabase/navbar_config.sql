-- ============================================================
-- LILY GOURMET — Disposition perso de la barre d'onglets (header)
-- Chaque utilisateur peut choisir quels onglets s'affichent et dans
-- quel ordre. Stocké en JSON : { "order": ["calendar","caisse",...],
-- "hidden": ["economat",...] }. NULL = affichage par défaut.
-- Les permissions priment toujours : on ne peut afficher qu'un onglet
-- auquel on a droit.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS navbar_config JSONB;
