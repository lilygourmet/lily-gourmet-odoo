-- ============================================================
-- Champ texte pour nommer la clinique / l'hôpital en cas d'urgence.
-- À exécuter AVANT le déploiement du code qui lit cette colonne.
-- ============================================================

ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS lieu_urgence_nom TEXT;
