-- ============================================================
-- Date d'ancienneté manuelle pour le calcul du quota congés.
-- Si renseignée, elle prime sur date_entree (qui peut être la date
-- contractuelle/fiche de salaire). Utile pour les employés ayant
-- travaillé avant la régularisation administrative.
-- À exécuter AVANT le déploiement du code qui lit cette colonne.
-- ============================================================

ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS date_anciennete DATE;
