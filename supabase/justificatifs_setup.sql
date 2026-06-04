-- ============================================================
-- Justificatifs d'absence (certificat médical, preuve d'absence).
-- Colonne sur conges + bucket de stockage privé.
-- À exécuter dans Supabase.
-- ============================================================

-- 1) Lien du fichier sur le congé
ALTER TABLE conges ADD COLUMN IF NOT EXISTS justificatif_path TEXT;

-- 2) Bucket privé
INSERT INTO storage.buckets (id, name, public)
VALUES ('justificatifs', 'justificatifs', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Politiques d'accès (auth maison : anon + authenticated)
DO $$ BEGIN
  CREATE POLICY "justificatifs insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'justificatifs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "justificatifs select" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'justificatifs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "justificatifs delete" ON storage.objects
    FOR DELETE TO anon, authenticated USING (bucket_id = 'justificatifs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
