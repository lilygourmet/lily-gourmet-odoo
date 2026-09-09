-- ============================================================
-- « Fabrication Annexe 2 » : ouvrir le catalogue à l'app, et poser les
-- ingrédients FIGÉS décidés avec Layla le 2026-09-09.
--
-- Un ingrédient figé garde la quantité de la recette QU'ON A DÉCIDÉ DE FAIRE,
-- même si la fournée sort moins que prévu. Tout le reste suit au prorata :
-- six royals demandent six fois la pesée du craquant, quatre en demandent
-- quatre.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Le catalogue doit être lisible ET modifiable par l'app.
--
-- Il n'était ouvert qu'au rôle `authenticated`, or l'app a sa propre connexion
-- et parle à Supabase avec la clé `anon` : la lecture ne renvoyait RIEN — pas
-- une erreur, zéro ligne. L'écran « Mini / maxi Annexe » affichait donc tous
-- les articles en « pas suivi », et rien ne s'enregistrait.
-- Même ouverture que `cd_minmax`, qui sert le même genre d'écran.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS fab_annexe_articles_all ON fab_annexe_articles;
CREATE POLICY fab_annexe_articles_all ON fab_annexe_articles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 2) Royal Chocolat 15 cm — la mousse.
--
-- Elle n'a pas d'article à elle chez Odoo : ses cinq matières premières sont
-- directement dans la recette du gâteau. Ce sont donc elles qu'on fige.
-- Le craquant et le biscuit brownie, eux, suivent la production.
--
-- ⚠️ « MP- Lait UHT » porte un espace INSÉCABLE entre « Lait » et « UHT ».
-- On l'écrit \u00A0 plutôt qu'en vrai : un caractère invisible se perd au
-- copier-coller, et un espace normal ne retrouverait pas l'article.
-- ------------------------------------------------------------
INSERT INTO fab_annexe_articles (produit, libelle, mini, maxi, tournee, figes, figes_nom)
VALUES (
  'SM- Royal Chocolat 15 cm', 'Royal Chocolat 15 cm', 0, 0, 6,
  ARRAY[
    E'MP- Lait\u00A0UHT',   -- \u00A0 = l'espace insécable, écrit en clair
    'MP- Gelatine feuille',
    'MP- Crème whipping',
    'MP- Chocolat Valrhona Guanaja',
    'MP- Chocolat Valrhona Jivara'
  ],
  'La mousse'
)
ON CONFLICT (produit) DO UPDATE
  SET figes = EXCLUDED.figes, figes_nom = EXCLUDED.figes_nom;

-- ------------------------------------------------------------
-- 3) Pr Cheesecake Exotique — le sublimé.
--
-- Il est monté selon la recette décidée, pas selon ce qui sort de la fournée.
-- Les deux tailles portent la même consigne.
--
-- ⚠️ « SM. Subleme fromage  passion » s'écrit avec DEUX espaces entre
-- « fromage » et « passion », tel quel dans Odoo.
--
-- La mousse meringue citron de la même recette n'a pas besoin d'être citée :
-- l'app fige d'office tout ce qui porte « mousse » dans son nom.
-- ------------------------------------------------------------
INSERT INTO fab_annexe_articles (produit, libelle, mini, maxi, tournee, figes, figes_nom)
VALUES
  ('SM- Pr Cheesecake Exotique indiv',   'Pr Cheesecake Exotique indiv',   0, 0, 1,
   ARRAY['SM. Subleme fromage  passion'], 'Le sublimé'),
  ('SM- Pr Cheesecake Exotique 10 pers', 'Pr Cheesecake Exotique 10 pers', 0, 0, 1,
   ARRAY['SM. Subleme fromage  passion'], 'Le sublimé')
ON CONFLICT (produit) DO UPDATE
  SET figes = EXCLUDED.figes, figes_nom = EXCLUDED.figes_nom;

-- ------------------------------------------------------------
-- Vérification : les trois lignes et leurs figés.
-- ------------------------------------------------------------
SELECT produit, mini, maxi, tournee, figes_nom, figes
  FROM fab_annexe_articles
 WHERE produit IN (
   'SM- Royal Chocolat 15 cm',
   'SM- Pr Cheesecake Exotique indiv',
   'SM- Pr Cheesecake Exotique 10 pers'
 )
 ORDER BY produit;
