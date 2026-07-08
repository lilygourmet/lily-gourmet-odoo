-- ============================================================
-- LILY GOURMET — Détails accessoire saisis à la prise de commande
-- Stocke la ligne « Accessoire : X pièces · couleur Y · forme Z »
-- (gourmandises GM-) pour l'afficher au calendrier et pré-remplir
-- la fiche de production (onglet Accessoires).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS acc_details text;
