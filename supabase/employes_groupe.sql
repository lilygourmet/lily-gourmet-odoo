-- ============================================================
-- Groupe / catégorie d'un employé (classement pour dispatch des perms).
-- Le groupe est juste une étiquette : il n'active AUCUNE permission
-- automatiquement (le dispatch des perms reste manuel).
-- Recopié sur le user (profiles.groupe) à la création pour affichage/filtre.
-- À exécuter dans Supabase AVANT de déployer le code.
-- ============================================================

ALTER TABLE employes ADD COLUMN IF NOT EXISTS groupe TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS groupe TEXT;
