-- ============================================================
-- LILY GOURMET — Traçabilité du règlement encaissé en livraison
-- Le livreur (Hamid) indique s'il a encaissé + le moyen (espèce/virement/chèque).
-- Le café confirme « reçu » quand le livreur remet l'argent/chèque.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS regle           BOOLEAN;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS moyen_paiement  TEXT;          -- 'espece' | 'virement' | 'cheque'
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS regle_montant   NUMERIC(10,2); -- reste encaissé (calculé, pour info café)
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS regle_client    TEXT;          -- nom client (affichage café)
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS regle_at        TIMESTAMPTZ;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS regle_by        UUID REFERENCES profiles(id);
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS remis_boutique  BOOLEAN;       -- reçu/remis au café
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS remis_at        TIMESTAMPTZ;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS remis_by        UUID REFERENCES profiles(id);
