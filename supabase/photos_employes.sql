-- ============================================================
-- Photos des employés : une photo par employé, affichée à côté du nom
-- (pointage, congés, etc.). Stockage dans un bucket PUBLIC (URL stable).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

-- 1) Colonne URL de la photo sur l'employé
ALTER TABLE employes ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 2) Bucket public pour les photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos-employes', 'photos-employes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Policies stockage : lecture publique + écriture (anon + authenticated,
--    comme le reste de l'app).
DO $$ BEGIN
  CREATE POLICY "photos-employes select" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'photos-employes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "photos-employes insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'photos-employes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "photos-employes update" ON storage.objects
    FOR UPDATE TO anon, authenticated USING (bucket_id = 'photos-employes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
