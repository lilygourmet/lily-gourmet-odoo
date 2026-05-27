-- ============================================================
-- LILY GOURMET - Paiements : preuves de virement transferees en interne
-- Marquer un message (photo/PDF) comme preuve de paiement, l'envoyer dans
-- la liste interne "Paiements a valider", puis le valider.
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

-- 1. Colonnes sur les messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_payment_proof    BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_order_ref   TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_client_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_validated_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index pour charger rapidement la liste des preuves
CREATE INDEX IF NOT EXISTS idx_msg_payment_proof ON messages(is_payment_proof) WHERE is_payment_proof = true;

-- 2. Permissions (table profiles)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_mark_payment_proof BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_view_payments      BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_validate_payments  BOOLEAN DEFAULT false;

-- Les regles RLS existantes (TO anon, authenticated) couvrent deja ces colonnes.
