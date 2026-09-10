-- ============================================================
-- « Fabrication Annexe 2 » : écrire la photo des articles qui n'en ont pas.
--
-- POURQUOI ce n'est pas cosmétique : quand un seul article du catalogue n'a
-- pas de photo, le serveur reconstruit TOUT le graphe des nomenclatures pour
-- retrouver son gâteau parent — 5 000 recettes, 40 000 lignes, 20 000 articles
-- lus chez Odoo. C'est l'essentiel des dix secondes du premier chargement de
-- la journée. Avec la photo écrite, ce graphe n'est plus calculé du tout.
--
-- Les valeurs ci-dessous sont exactement celles que le graphe trouve
-- aujourd'hui : rien ne change à l'écran, tout change au chronomètre.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

UPDATE fab_annexe_articles SET photo = 'E- Tiramisu'
 WHERE produit = 'SM. Sirop d''imbibage cafe Tiramisu' AND photo IS NULL;

UPDATE fab_annexe_articles SET photo = 'E- Royal chocolat'
 WHERE produit IN ('SM- Royal Chocolat 15 cm', 'SM- Royal Chocolat 20 cm',
                   'SM. glacage mirroir Finition') AND photo IS NULL;

UPDATE fab_annexe_articles SET photo = 'E- Cheesecake Exotique'
 WHERE produit IN ('SM- Cheesecake Exotique indiv', 'SM- Cheesecake Exotique 10 pers')
   AND photo IS NULL;

UPDATE fab_annexe_articles SET photo = 'E- Le Citron Framboise'
 WHERE produit = 'SM. Crème légère vanille citron' AND photo IS NULL;

-- ------------------------------------------------------------
-- Vérification : plus aucun article suivi ne doit être sans photo.
-- Si cette requête renvoie des lignes, dis-le-moi : leur parent n'a pas été
-- trouvé et il faut le choisir à la main.
-- ------------------------------------------------------------
SELECT produit, photo
  FROM fab_annexe_articles
 WHERE actif AND photo IS NULL
 ORDER BY produit;
