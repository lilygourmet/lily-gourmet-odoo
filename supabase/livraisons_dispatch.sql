-- ============================================================
-- Dispatch des livraisons aux livreurs.
-- À exécuter dans Supabase.
-- ============================================================

-- Livreur assigné + statut "livré" sur la commande
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS livreur_id      UUID;
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS livraison_faite BOOLEAN DEFAULT false;

-- Livreur par défaut (reçoit les livraisons non encore assignées)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS livreur_defaut  BOOLEAN DEFAULT false;
