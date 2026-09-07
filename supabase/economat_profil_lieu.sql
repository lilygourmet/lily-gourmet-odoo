-- ============================================================
-- ÉCONOMAT — chaque badge dit OÙ part le stock
--
-- Avant : la liste « badge -> lieu de stock » était écrite dans le code
-- serveur (api/economat-transfert.js). Un badge créé depuis l'app n'y
-- figurait pas : l'employé recevait « ce badge n'a pas de destination de
-- stock définie » (vécu par Bouchta avec le badge « Chocolat »).
--
-- Après : le lieu est un réglage du badge, choisi dans
-- Économat -> Gérer -> Badges. Le serveur le lit ici.
--
-- Trois lieux possibles :
--   'boutique' = WHLVP/Stock/Stock Vente
--   'prod'     = WHLVP/Stock/Stock Prod
--   'annexe'   = WHPDX/Stock Prod annexe
--
-- À LANCER DANS SUPABASE AVANT LE DÉPLOIEMENT.
-- ============================================================

ALTER TABLE economat_profils ADD COLUMN IF NOT EXISTS lieu TEXT;

-- Les badges existants gardent EXACTEMENT la destination qu'ils avaient
-- dans le code : personne ne voit son stock changer d'endroit.
UPDATE economat_profils SET lieu = 'boutique' WHERE value IN ('boutique');
UPDATE economat_profils SET lieu = 'prod'     WHERE value IN ('cake_design', 'prod_finition_cd', 'menage_boutique');
UPDATE economat_profils SET lieu = 'annexe'   WHERE value IN ('prod_annex', 'menage_annex', 'cuisine', 'chocolat', 'chocolat_cuisine_menage');

-- Vérification : aucun badge ne doit rester sans lieu.
SELECT value, label, coalesce(lieu, '⚠️ AUCUN LIEU') AS lieu
FROM economat_profils
ORDER BY display_order;
