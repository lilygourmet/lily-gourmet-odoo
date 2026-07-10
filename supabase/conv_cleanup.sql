-- « Nettoyage du jour » des conversations : mémorise, par utilisateur, le jour où
-- le nettoyage a été fait et le jour où l'échappatoire « Tout garder (urgence) » a été utilisée.
-- À lancer dans Supabase (SQL editor) AVANT de déployer.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conv_cleanup_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conv_cleanup_skip_date date;
