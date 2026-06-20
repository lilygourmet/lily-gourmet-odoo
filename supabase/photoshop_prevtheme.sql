-- Mémorise la catégorie d'origine d'une image mise à la corbeille (pour la restaurer au bon endroit).
-- À lancer dans Supabase (SQL editor).
ALTER TABLE ps_photos ADD COLUMN IF NOT EXISTS prev_theme text;
