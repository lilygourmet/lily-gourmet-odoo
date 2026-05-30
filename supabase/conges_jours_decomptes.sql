-- ============================================================
-- Fige le nombre de jours décomptés au moment de la validation,
-- pour qu'un changement de planning d'employé ne recalcule pas
-- rétroactivement les anciens congés.
-- À exécuter AVANT déploiement du code qui lit/écrit cette colonne.
-- ============================================================

ALTER TABLE conges
  ADD COLUMN IF NOT EXISTS jours_decomptes NUMERIC;

COMMENT ON COLUMN conges.jours_decomptes IS
  'Nb de jours décomptés du solde, figé à la validation. Si NULL, recalculé à la volée (fallback).';
