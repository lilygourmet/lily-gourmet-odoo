-- ============================================================
-- LILY GOURMET — Caisse : option « facture à récupérer » sur les dépenses de Hamid
-- (même fonctionnement que les factures Meriem / courses)
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS is_facture BOOLEAN DEFAULT false;
ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS facture_status TEXT;          -- NULL | 'pending' | 'recovered'
ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS facture_cheque TEXT;
ALTER TABLE caisse_hamid_depenses ADD COLUMN IF NOT EXISTS facture_recovered_at TIMESTAMPTZ;
