-- Permission « Studio photos » (onglet d'édition/composition de photos pour gâteaux).
-- À lancer dans Supabase (SQL editor) AVANT de déployer.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_photoshop boolean NOT NULL DEFAULT false;
