-- ============================================================
-- ÉCONOMAT — supprimer le badge « Chocolat / Cuisine / Ménage »
--
-- Layla gère ses propres badges (menage_annex, menage_boutique, …).
-- Le badge combiné d'origine n'a plus lieu d'être.
--
-- ⚠️ À LIRE AVANT DE LANCER
-- Supprimer ce badge retire aussi ses liens vers les catégories.
-- Les catégories Chocolat et Cuisine ne seront alors visibles par
-- PERSONNE tant qu'un autre badge ne les coche pas.
-- Le bon ordre : d'abord créer les badges qui les remplacent
-- (Économat -> Gérer -> Badges), cocher les catégories, PUIS lancer ceci.
-- ============================================================

-- 1) Qui porte encore ce badge ? S'il y a des lignes, leur donner un
--    autre badge dans ⚙️ -> Utilisateurs AVANT de continuer.
SELECT username, full_name, economat_profil
FROM profiles
WHERE economat_profil = 'chocolat_cuisine_menage';

-- 2) Quelles catégories vont perdre ce badge (et par quoi elles sont
--    encore vues). Une catégorie qui n'apparaît QUE ci-dessous, sans
--    autre badge, deviendra invisible.
SELECT c.name AS categorie,
       string_agg(pc2.profil, ', ') FILTER (WHERE pc2.profil <> 'chocolat_cuisine_menage') AS autres_badges
FROM economat_profil_categories pc
JOIN economat_categories c ON c.id = pc.category_id
LEFT JOIN economat_profil_categories pc2 ON pc2.category_id = c.id
WHERE pc.profil = 'chocolat_cuisine_menage'
GROUP BY c.name
ORDER BY c.name;

-- 3) Suppression des liens
DELETE FROM economat_profil_categories
WHERE profil = 'chocolat_cuisine_menage';

-- 4) Suppression du badge (seulement si la table des badges existe)
DO $$
BEGIN
  IF to_regclass('public.economat_profils') IS NOT NULL THEN
    DELETE FROM economat_profils WHERE value = 'chocolat_cuisine_menage';
  END IF;
END $$;

-- 5) Vérification : qui voit quoi maintenant
SELECT pc.profil, c.name AS categorie
FROM economat_profil_categories pc
JOIN economat_categories c ON c.id = pc.category_id
ORDER BY pc.profil, c.name;
