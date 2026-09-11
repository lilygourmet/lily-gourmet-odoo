-- ============================================================
-- Le catalogue suit les noms d'Odoo — biscuits gianduja renommés.
--
-- POURQUOI : Layla a renommé chez Odoo, le 2026-09-11 :
--    SM. Biscuit chocolat Gianduja        → SM. Biscuit Gianduja (plaque)
--    SM. Biscuit chocolat Gianduja Indiv  → SM. Biscuit Gianduja indiv
-- Le catalogue de l'annexe gardait les anciens noms : l'app ne trouvait plus
-- l'article chez Odoo et affichait « 1 à faire » pour un travail qui n'existe
-- pas. (L'écran dit maintenant « introuvable dans Odoo », mais le vrai
-- correctif est ici.)
--
-- ⚠️ Vérifie d'abord la requête de contrôle en bas : si elle renvoie déjà les
-- nouveaux noms, il n'y a rien à faire.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

UPDATE fab_annexe_articles
   SET produit = 'SM. Biscuit Gianduja (plaque)'
 WHERE produit = 'SM. Biscuit chocolat Gianduja'
   AND NOT EXISTS (SELECT 1 FROM fab_annexe_articles a
                    WHERE a.produit = 'SM. Biscuit Gianduja (plaque)');

UPDATE fab_annexe_articles
   SET produit = 'SM. Biscuit Gianduja indiv'
 WHERE produit = 'SM. Biscuit chocolat Gianduja Indiv'
   AND NOT EXISTS (SELECT 1 FROM fab_annexe_articles a
                    WHERE a.produit = 'SM. Biscuit Gianduja indiv');

-- Si les nouveaux noms existaient déjà, les anciens ne servent plus à rien :
DELETE FROM fab_annexe_articles
 WHERE produit IN ('SM. Biscuit chocolat Gianduja', 'SM. Biscuit chocolat Gianduja Indiv');

-- ------------------------------------------------------------
-- Contrôle : plus aucune ligne au nom d'avant.
-- ------------------------------------------------------------
SELECT produit, mini, maxi, tournee, actif
  FROM fab_annexe_articles
 WHERE produit ILIKE '%gianduja%'
 ORDER BY produit;
