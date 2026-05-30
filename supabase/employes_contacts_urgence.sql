-- ============================================================
-- Ajout de champs de contact + urgence sur les employés.
-- À exécuter AVANT le déploiement du code qui lit ces colonnes
-- (sinon loadUsers/loadFreshUser plante et tout le monde est déconnecté).
-- ============================================================

ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS telephone                   TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence_1_nom       TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence_1_telephone TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence_2_nom       TEXT,
  ADD COLUMN IF NOT EXISTS contact_urgence_2_telephone TEXT,
  ADD COLUMN IF NOT EXISTS lieu_urgence                TEXT
    CHECK (lieu_urgence IN ('clinique', 'hopital_public', 'famille') OR lieu_urgence IS NULL);
