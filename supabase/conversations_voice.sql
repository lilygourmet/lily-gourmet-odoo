-- ============================================================
-- LILY GOURMET - Conversations : messages vocaux (F6)
-- 1) Colonne media_type sur messages (distinguer audio / image / doc).
-- 2) Autoriser les MIME audio dans le bucket conversation-media
--    (il n'acceptait que image/* et application/pdf).
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT m)
  FROM unnest(
    coalesce(allowed_mime_types, ARRAY[]::text[])
    || ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac']
  ) AS m
)
WHERE id = 'conversation-media';
