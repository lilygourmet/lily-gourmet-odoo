-- ============================================================
-- LILY GOURMET — Nom de l'ÉMETTEUR lu sur la preuve de virement
--
-- La banque écrit le nom de QUI PAIE (« VIR INST RECU LEBDAR NAWAL »).
-- Odoo écrit le nom de QUI ACHÈTE (« Maryam el bairi »).
-- Quand un proche paie pour la cliente, rien ne relie les deux — et le
-- virement reste « non lié » pour toujours.
--
-- La preuve de paiement, elle, est DÉJÀ rattachée à la commande et à la
-- cliente par l'équipe. Il suffit d'y lire le nom de l'émetteur pour faire
-- le pont. On le range ici.
--
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_payer_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_read_at    TIMESTAMPTZ;

-- Retrouver vite les preuves pas encore lues, et les couples payeur -> cliente.
CREATE INDEX IF NOT EXISTS idx_msg_payment_a_lire
  ON messages(is_payment_proof) WHERE is_payment_proof = true AND payment_read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_msg_payment_payer
  ON messages(payment_payer_name) WHERE payment_payer_name IS NOT NULL;
