-- ============================================================
-- Permet de marquer un message comme supprimé (suppression "soft").
-- L'app continue à afficher la ligne mais avec "[Message supprimé]"
-- au lieu du contenu original.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at_wati BOOLEAN DEFAULT false;

COMMENT ON COLUMN messages.deleted_at IS
  'Timestamp de la suppression côté Lily. Le message s''affiche '
  '"[Message supprimé]" dans le fil.';
COMMENT ON COLUMN messages.deleted_at_wati IS
  'true si l''appel API WATI delete a réussi (suppression effective '
  'chez le client). false si on n''a pas pu (fenêtre 15 min écoulée, '
  'API indisponible…) : dans ce cas le client voit encore le message.';
