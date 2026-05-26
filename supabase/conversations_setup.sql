-- ============================================================
-- LILY GOURMET — MODULE CONVERSATIONS WHATSAPP — Setup
-- À exécuter dans Supabase SQL Editor (1 fois). Relançable sans risque.
-- ============================================================

-- 1) Permission sur profiles (accès à l'onglet Conversations)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_conversations BOOLEAN DEFAULT false;

-- 2) Conversations (1 ligne = 1 fil de discussion avec UN contact WhatsApp)
CREATE TABLE IF NOT EXISTS conversations (
  id              BIGSERIAL PRIMARY KEY,
  client_phone    TEXT NOT NULL UNIQUE,          -- numéro WhatsApp du client (1 fil par numéro)
  client_name     TEXT,                          -- nom du contact (peut être vide au début)
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL, -- commercial qui a cliqué "Je prends"
  status          TEXT NOT NULL DEFAULT 'non_assignee'
                    CHECK (status IN ('non_assignee', 'en_cours', 'fermee')),
  last_message_at TIMESTAMPTZ,                    -- dernier message (entrant OU sortant) → tri de l'inbox
  last_inbound_at TIMESTAMPTZ,                    -- dernier message REÇU du client → sert aux alertes 30min/2h/3j
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_status_last  ON conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_assigned     ON conversations(assigned_to);
-- index dédié aux alertes : retrouver vite les fils non fermés en attente de réponse
CREATE INDEX IF NOT EXISTS idx_conv_alertes      ON conversations(last_inbound_at) WHERE status <> 'fermee';

-- 3) Messages (entrants du client, sortants des commerciaux, notes système)
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('client', 'agent', 'system')),
  sender_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL, -- rempli si sender_type='agent'
  body            TEXT,                          -- texte du message (peut être vide si média seul)
  media_url       TEXT,                          -- image/audio/doc reçu ou envoyé
  sent_at         TIMESTAMPTZ NOT NULL,          -- horodatage fourni par WhatsApp/Wati
  wa_message_id   TEXT UNIQUE,                   -- id WhatsApp → évite les doublons si Wati renvoie le webhook
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, sent_at);

-- 4) Événements (journal d'audit : qui a pris/fermé/rouvert, alerte envoyée, etc.)
CREATE TABLE IF NOT EXISTS conversation_events (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,                 -- ex: 'assigned', 'closed', 'reopened', 'alert_sent'
  by_user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL, -- vide si déclenché par le système
  payload         JSONB,                         -- détails libres (ex: {"alert_level":"2h"})
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_conv ON conversation_events(conversation_id, created_at);

-- ============================================================
-- RLS — Permissif (sécurité fine gérée côté app, comme task-attachments)
-- ============================================================
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all conversations" ON conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all messages" ON messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all conversation_events" ON conversation_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
