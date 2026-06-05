-- ============================================================
-- Livraisons : 3 permissions (l'onglet devient une perm normale).
--   perm_livraisons_dispatch : voit TOUTES les livraisons + peut assigner
--   perm_livreur_defaut      : reçoit les livraisons non assignées (+ les siennes)
--   perm_livreur_assigne     : voit seulement ce qu'on lui assigne
-- À exécuter AVANT le déploiement du code.
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_livraisons_dispatch BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_livreur_defaut      BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_livreur_assigne     BOOLEAN DEFAULT false;
