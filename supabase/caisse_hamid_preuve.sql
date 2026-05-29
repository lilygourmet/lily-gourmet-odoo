-- ============================================================
-- LILY GOURMET — Caisse : preuve (photo/reçu) par dépense de Hamid
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ;
