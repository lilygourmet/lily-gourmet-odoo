-- ============================================================
-- Demandes de MODIFICATION de commande.
-- Le commercial déclenche depuis une conversation (bouton « ✏️ Modif ») :
-- ça envoie le dernier n° S à l'équipe perm_modification (onglet Modifications).
-- À exécuter dans Supabase AVANT/au déploiement.
-- ============================================================

-- 1) Nouvelle permission
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_modification BOOLEAN DEFAULT false;

-- 2) Table des demandes de modification
CREATE TABLE IF NOT EXISTS modifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref       TEXT,                       -- n° de commande (Sxxxx)
  client_name     TEXT,
  client_phone    TEXT,
  conversation_id BIGINT,                      -- conversations.id est un BIGINT
  description     TEXT,                        -- ce que le commercial demande de modifier
  justificatif_path TEXT,                      -- fichier joint (bucket justificatifs)
  note            TEXT,                        -- ce que la personne Modification a fait
  status          TEXT DEFAULT 'a_traiter',    -- 'a_traiter' | 'fait'
  requested_by    UUID,
  requested_at    TIMESTAMPTZ DEFAULT now(),
  done_by         UUID,
  done_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_modifications_status ON modifications (status);

-- 3) RLS — auth maison (anon + authenticated), comme le reste de l'app
ALTER TABLE modifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS modifications_all ON modifications;
CREATE POLICY modifications_all ON modifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
