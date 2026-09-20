-- ============================================================
-- LA MASSE GÉLATINE SE FABRIQUE — elle doit donc BLOQUER.
--
-- « Masse gélatine doit bloquer le travail si elle n'est pas en stock. Comment
-- il a pu marquer comme fait ? » (Layla, 2026-09-20).
--
-- La réponse était en base, pas dans l'écran : `SM. Masse Gélatine` portait
-- `achete = true`. Or un ingrédient ACHETÉ ne bloque jamais — c'est la règle
-- posée pour le sucre et la framboise congelée (voir `fab_annexe_achete.sql`) :
-- le pâtissier ne peut pas fabriquer du sucre, et le stock des matières
-- premières n'est pas tenu à jour. Le verrou la laissait donc passer, quoi
-- qu'il arrive.
--
-- Sauf qu'elle N'EST PAS achetée : elle a sa recette chez Odoo (60 g d'eau +
-- 10 g de gélatine en poudre, une part de poudre pour six d'eau), et tout le
-- reste de l'app la traite déjà comme une préparation — elle sort sa propre
-- feuille dans la liasse au lieu d'être demandée à l'économat
-- (`feuillesAImprimer.test.js`). Le drapeau était l'intrus.
--
-- ⚠️ CE QUE ÇA CHANGE, ET C'EST VOULU : tant qu'il n'y en a pas assez au Stock
-- Prod (0,01 kg au moment où j'écris), tout ce qui en demande vraiment se
-- bloque. On s'en sort en en déclarant une tournée (0,8 kg) — eau + poudre.
-- Les recettes qui n'en prennent qu'une trace (0,06 g pour la mousse pistache)
-- ne bloquent pas : le verrou compare au besoin réel.
--
-- À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

UPDATE fab_annexe_articles
   SET achete = false
 WHERE produit = 'SM. Masse Gélatine';

-- Ce qui reste marqué « acheté », pour vérifier d'un coup d'œil.
SELECT produit, actif, achete FROM fab_annexe_articles WHERE achete ORDER BY produit;
