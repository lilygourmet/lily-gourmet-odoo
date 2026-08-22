-- ============================================================
-- LILY GOURMET — Retrait des droits « envoyer » / « réceptionner »
-- Ils n'apportaient rien : dans les faits, les mêmes personnes font les deux.
-- On revient à la règle simple :
--   • l'ATELIER (Prod annexe / Prod boutique) dit ce qu'on peut faire :
--     envoyer depuis chez soi, confirmer ce qui y arrive ;
--   • « Transferts Produits (SM) » dit ce qu'on peut transférer.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles DROP COLUMN IF EXISTS perm_transfert_envoi;
ALTER TABLE profiles DROP COLUMN IF EXISTS perm_transfert_reception;
