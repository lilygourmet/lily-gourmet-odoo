-- ============================================================
-- LILY GOURMET — Policies du bucket Storage 'conversation-media'
-- Le bucket (privé, 5 MB, image/* + application/pdf) a été créé à la main.
-- Ici on ajoute seulement les règles d'accès, comme pour 'task-attachments' :
-- upload + lecture autorisés en anon ET authenticated (auth maison).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

DO $$ BEGIN
  CREATE POLICY "conv media insert" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'conversation-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "conv media select" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'conversation-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
