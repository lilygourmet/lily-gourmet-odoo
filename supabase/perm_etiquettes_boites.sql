-- Permission « Étiquettes boîtes » (onglet FR + arabe à coller sur les boîtes).
-- À lancer une fois dans Supabase (SQL Editor) AVANT/APRÈS le déploiement.
-- Idempotent : ne fait rien si la colonne existe déjà.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_etiquettes_boites boolean NOT NULL DEFAULT false;
