-- Mémorise la dernière taille (cm) utilisée pour chaque image du Studio photos.
-- À lancer dans Supabase (SQL editor).
ALTER TABLE ps_photos ADD COLUMN IF NOT EXISTS last_w real;
ALTER TABLE ps_photos ADD COLUMN IF NOT EXISTS last_h real;
