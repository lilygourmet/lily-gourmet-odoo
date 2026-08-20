-- ============================================================
-- ÉCONOMAT — RÉPARATION : remettre le badge « Cuisine »
--
-- Le script economat_retirer_badges_auto.sql supprimait les badges
-- 'chocolat', 'menage' et 'cuisine' en les croyant tous créés
-- automatiquement. En réalité « Cuisine » était un badge de Layla :
-- il a été supprimé à tort. Ce script le remet.
--
-- Les employés n'ont rien perdu : profiles.economat_profil n'a jamais
-- été modifié. Seuls le badge et son lien vers la catégorie manquaient.
-- ============================================================

-- 1) Remettre le badge
DO $$
BEGIN
  IF to_regclass('public.economat_profils') IS NOT NULL THEN
    INSERT INTO economat_profils (value, label, display_order)
    VALUES ('cuisine', 'Cuisine', 75)
    ON CONFLICT (value) DO NOTHING;
  END IF;
END $$;

-- 2) Le badge « Cuisine » voit la catégorie Cuisine
INSERT INTO economat_profil_categories (profil, category_id)
SELECT 'cuisine', c.id FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (profil, category_id) DO NOTHING;

-- 3) Le badge « Chocolat » (code interne chocolat_cuisine_menage) ne voit
--    plus que le Chocolat : Cuisine a son badge, Ménage a menage_annex et
--    menage_boutique. À commenter si tu préfères qu'il voie tout.
DELETE FROM economat_profil_categories
WHERE profil = 'chocolat_cuisine_menage'
  AND category_id IN (SELECT id FROM economat_categories WHERE name IN ('Cuisine', 'Ménage'));

-- 4) Vérification : qui voit quoi
SELECT pc.profil, c.name AS categorie
FROM economat_profil_categories pc
JOIN economat_categories c ON c.id = pc.category_id
ORDER BY pc.profil, c.name;

-- 5) Vérification : les badges et qui les porte
SELECT p.value, p.label, count(pr.id) AS employes
FROM economat_profils p
LEFT JOIN profiles pr ON pr.economat_profil = p.value
GROUP BY p.value, p.label
ORDER BY p.display_order;
