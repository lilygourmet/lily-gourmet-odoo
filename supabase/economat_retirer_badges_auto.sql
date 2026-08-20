-- ============================================================
-- ÉCONOMAT — retirer les 3 badges créés automatiquement
--
-- Une première version de economat_import_prod_annexe.sql créait trois
-- badges « Chocolat », « Ménage », « Cuisine ». Layla garde SES badges :
-- ce script les enlève.
--
-- Ce qui N'EST PAS touché : les badges d'origine, les catégories, les
-- groupes et les articles importés.
--
-- Sans effet si la première version n'a jamais été lancée.
-- ============================================================

-- 1) Qui porte encore un de ces badges ? (à regarder AVANT de continuer)
--    S'il y a des lignes, ces employés perdront l'accès : leur redonner
--    un badge dans ⚙️ -> Utilisateurs.
SELECT username, full_name, economat_profil
FROM profiles
WHERE economat_profil IN ('chocolat', 'menage', 'cuisine');

-- 2) Les liens badge -> catégorie de ces 3 badges
DELETE FROM economat_profil_categories
WHERE profil IN ('chocolat', 'menage', 'cuisine');

-- 3) Les badges eux-mêmes (seulement si la table des badges existe)
DO $$
BEGIN
  IF to_regclass('public.economat_profils') IS NOT NULL THEN
    DELETE FROM economat_profils WHERE value IN ('chocolat', 'menage', 'cuisine');
  END IF;
END $$;

-- 4) Filet : les 3 catégories restent visibles par le badge d'origine
--    « Chocolat / Cuisine / Ménage » (même chose que dans l'import).
INSERT INTO economat_profil_categories (profil, category_id)
SELECT 'chocolat_cuisine_menage', c.id
FROM economat_categories c
WHERE c.name IN ('Chocolat', 'Ménage', 'Cuisine')
ON CONFLICT (profil, category_id) DO NOTHING;

-- 5) Vérification : qui voit quoi maintenant
SELECT pc.profil, c.name AS categorie
FROM economat_profil_categories pc
JOIN economat_categories c ON c.id = pc.category_id
ORDER BY pc.profil, c.name;
