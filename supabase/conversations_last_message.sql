-- ============================================================
-- Aperçu du dernier message dans la liste Conversations
-- ------------------------------------------------------------
-- Ajoute une colonne `last_message_body` sur conversations, tenue à jour
-- AUTOMATIQUEMENT par un déclencheur à chaque nouveau message (aucune modif
-- du webhook). Préfixe « Vous : » si c'est l'équipe qui a écrit en dernier.
-- À lancer UNE fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_body text;

CREATE OR REPLACE FUNCTION set_conv_last_message() RETURNS trigger AS $$
BEGIN
  UPDATE conversations
  SET last_message_body = LEFT(
    (CASE WHEN NEW.sender_type = 'agent' THEN 'Vous : ' ELSE '' END) ||
    COALESCE(NULLIF(NEW.body, ''), CASE WHEN NEW.media_url IS NOT NULL THEN 'Pièce jointe' ELSE '' END),
    140)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conv_last_message ON messages;
CREATE TRIGGER trg_conv_last_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION set_conv_last_message();

-- Remplissage initial : dernier message de chaque conversation existante
UPDATE conversations c
SET last_message_body = LEFT(
  (CASE WHEN m.sender_type = 'agent' THEN 'Vous : ' ELSE '' END) ||
  COALESCE(NULLIF(m.body, ''), CASE WHEN m.media_url IS NOT NULL THEN 'Pièce jointe' ELSE '' END),
  140)
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, body, media_url, sender_type
  FROM messages
  ORDER BY conversation_id, sent_at DESC
) m
WHERE m.conversation_id = c.id;
