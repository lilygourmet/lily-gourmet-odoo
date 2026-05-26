-- ============================================================
-- LILY GOURMET — Conversations : badge + temps réel (UX)
-- 1) Colonne pour mémoriser la dernière visite de l'onglet Conversations
--    (sert à calculer les "non lus").
-- 2) Activer le temps réel (realtime) sur conversations + messages, pour le
--    badge, les toasts et le son. Sans ça, le badge se met à jour via le
--    polling 30 s (fallback), mais pas instantanément.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_visited_conversations TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;
