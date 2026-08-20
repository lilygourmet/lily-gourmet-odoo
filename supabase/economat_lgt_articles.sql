-- ============================================================
-- ÉCONOMAT — 99 articles de l'Odoo LG TRAITEUR dans la catégorie Cuisine
--
-- Ces articles n'existent PAS dans l'Odoo Lily Gourmet : ils portent
-- odoo_source = 'lgt'. Leur demande crée une RÉCEPTION dans LGT prod,
-- une par fournisseur (dernier fournisseur connu de 2026).
--
-- ⚠️ ORDRE OBLIGATOIRE
--   1. economat_lgt_source.sql   (les colonnes)
--   2. le code doit être DÉPLOYÉ (sinon la demande part dans le mauvais Odoo)
--   3. ce fichier
--
-- Rejouable : relancé deux fois, il ne crée pas de doublon.
-- ============================================================

-- 1) Familles à l'intérieur de la catégorie Cuisine
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Légumes, fruits & herbes', 110 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Viandes & charcuterie', 120 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Poissons & fruits de mer', 130 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Crèmerie, fromages & œufs', 140 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Épices & graines', 150 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Sauces, huiles & conserves', 160 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Épicerie sèche', 170 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Divers', 180 FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;

-- 2) Articles (99)

--    Légumes, fruits & herbes : 28
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Ail', 'kg', 4941, 'MPC- Ail', 'lgt', 8614, 'Ouichene Abdelali', 1010
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4941 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Aneth', 'Units', 4732, 'MPC- Aneth', 'lgt', 8614, 'Ouichene Abdelali', 1020
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4732 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Aubergine', 'kg', 4980, 'MPC- Aubergine', 'lgt', 8614, 'Ouichene Abdelali', 1030
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4980 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Avocat', 'kg', 4735, 'MPC- Avocat', 'lgt', 8614, 'Ouichene Abdelali', 1040
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4735 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Basilic', 'Units', 4780, 'MPC- Basilic', 'lgt', 8614, 'Ouichene Abdelali', 1050
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4780 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Betterave', 'kg', 5016, 'MPC- Betterave', 'lgt', 8614, 'Ouichene Abdelali', 1060
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5016 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Botte de menthe', 'Units', 4702, 'MPC- Botte de menthe', 'lgt', 8614, 'Ouichene Abdelali', 1070
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4702 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Carotte', 'kg', 4737, 'MPC- Carotte', 'lgt', 8614, 'Ouichene Abdelali', 1080
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4737 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Champignon de paris', 'kg', 4944, 'MPC- Champignon de paris', 'lgt', 8614, 'Ouichene Abdelali', 1090
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4944 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Chou Rouge', 'kg', 4947, 'MPC- Chou Rouge', 'lgt', 8614, 'Ouichene Abdelali', 1100
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4947 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Ciboulette', 'Units', 4807, 'MPC- Ciboulette', 'lgt', 8614, 'Ouichene Abdelali', 1110
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4807 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Citron fruit', 'kg', 810, 'MPC- Citron fruit', 'lgt', 8614, 'Ouichene Abdelali', 1120
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 810 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Concombre', 'kg', 4948, 'MPC- Concombre', 'lgt', 8614, 'Ouichene Abdelali', 1130
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4948 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Coriandre', 'Units', 4815, 'MPC- Coriandre', 'lgt', 8614, 'Ouichene Abdelali', 1140
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4815 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Courgette', 'kg', 4739, 'MPC- Courgette', 'lgt', 8614, 'Ouichene Abdelali', 1150
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4739 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Epinards', 'kg', 4951, 'MPC- Epinards', 'lgt', 8614, 'Ouichene Abdelali', 1160
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4951 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Germes', 'Units', 4730, 'MPC- Germes', 'lgt', 8614, 'Ouichene Abdelali', 1170
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4730 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Gingembre frais', 'kg', 874, 'MPC- Gingembre frais', 'lgt', 8614, 'Ouichene Abdelali', 1180
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 874 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Mangue', 'kg', 2893, 'MPC- Mangue', 'lgt', 8614, 'Ouichene Abdelali', 1190
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2893 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Oignon', 'kg', 4955, 'MPC- Oignon', 'lgt', 8614, 'Ouichene Abdelali', 1200
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4955 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Persil', 'Units', 4729, 'MPC- Persil', 'lgt', 8614, 'Ouichene Abdelali', 1210
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4729 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Poireau', 'kg', 4922, 'MPC- Poireau', 'lgt', 8614, 'Ouichene Abdelali', 1220
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4922 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Poivron', 'kg', 4763, 'MPC- Poivron', 'lgt', 8614, 'Ouichene Abdelali', 1230
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4763 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pomme de terre', 'kg', 4958, 'MPC- Pomme de terre', 'lgt', 8614, 'Ouichene Abdelali', 1240
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4958 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Roquette', 'Units', 4731, 'MPC- Roquette', 'lgt', 8614, 'Ouichene Abdelali', 1250
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4731 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Salade verte', 'Units', 4734, 'MPC- Salade verte', 'lgt', 8614, 'Ouichene Abdelali', 1260
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4734 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Tomate', 'kg', 4962, 'MPC- Tomate', 'lgt', 8614, 'Ouichene Abdelali', 1270
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4962 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Tomate Cerise', 'kg', 4963, 'MPC- Tomate Cerise', 'lgt', 8614, 'Ouichene Abdelali', 1280
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Légumes, fruits & herbes'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4963 AND a.odoo_source = 'lgt');

--    Viandes & charcuterie : 13
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Blanc de poulet', 'kg', 4942, 'MPC- Blanc de poulet', 'lgt', 56, 'Marjane', 1290
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4942 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Dinde fumée', 'kg', 4726, 'MPC- Dinde fumée', 'lgt', 56, 'Marjane', 1300
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4726 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Haut de cuisse', 'kg', 4952, 'MPC- Haut de cuisse', 'lgt', 56, 'Marjane', 1310
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4952 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Khlii', 'kg', 4795, 'MPC- Khlii', 'lgt', 49, 'Carrefour Market', 1320
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4795 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pastrami', 'kg', 4716, 'MPC- Pastrami', 'lgt', 56, 'Marjane', 1330
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4716 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Peppéroni', 'kg', 4921, 'MPC- Peppéroni', 'lgt', 8598, 'DVIAM  (la fonda)', 1340
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4921 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pilon de poulet', 'kg', 4986, 'MPC- Pilon de poulet', 'lgt', 56, 'Marjane', 1350
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4986 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Poulet Entier', 'kg', 4984, 'MPC- Poulet Entier', 'lgt', 56, 'Marjane', 1360
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4984 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Saucisse de Cocktail', 'kg', 4959, 'MPC- Saucisse de Cocktail', 'lgt', 8606, 'agrial', 1370
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4959 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Viande Hachée', 'kg', 4965, 'MPC- Viande Hachée', 'lgt', 56, 'Marjane', 1380
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4965 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Viande Hachée Dinde', 'kg', 4966, 'MPC- Viande Hachée Dinde', 'lgt', 56, 'Marjane', 1390
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4966 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Viande Hachée Poulet ( Blanc de poulet)', 'kg', 4898, 'MPC- Viande Hachée Poulet ( Blanc de poulet)', 'lgt', 56, 'Marjane', 1400
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4898 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Viande Hachée Régime', 'kg', 4919, 'MPC- Viande Hachée Régime', 'lgt', 56, 'Marjane', 1410
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Viandes & charcuterie'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4919 AND a.odoo_source = 'lgt');

--    Poissons & fruits de mer : 5
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Calamars Surgelés', 'kg', 4943, 'MPC- Calamars Surgelés', 'lgt', 56, 'Marjane', 1420
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Poissons & fruits de mer'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4943 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Crevette décortiquée', 'kg', 4950, 'MPC- Crevette décortiquée', 'lgt', 56, 'Marjane', 1430
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Poissons & fruits de mer'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4950 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Saumon frais', 'kg', 4960, 'MPC- Saumon frais', 'lgt', 56, 'Marjane', 1440
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Poissons & fruits de mer'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4960 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Saumon fumé', 'pack 200 g', 4756, 'MPC- Saumon fumé', 'lgt', 8607, 'Amares', 1450
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Poissons & fruits de mer'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4756 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Thon', 'kg', 4926, 'MPC- Thon', 'lgt', 56, 'Marjane', 1460
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Poissons & fruits de mer'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4926 AND a.odoo_source = 'lgt');

--    Crèmerie, fromages & œufs : 11
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Cheddar', 'kg', 4824, 'MPC- Cheddar', 'lgt', 56, 'Marjane', 1470
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4824 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Emmental', 'kg', 4719, 'MPC- Emmental', 'lgt', 56, 'Marjane', 1480
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4719 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Fromage Edam', 'kg', 4977, 'MPC- Fromage Edam', 'lgt', 56, 'Marjane', 1490
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4977 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Fromage fumé', 'kg', 4975, 'MPC- Fromage fumé', 'lgt', 56, 'Marjane', 1500
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4975 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Fromage Milky food', 'kg', 4915, 'MPC- Fromage Milky food', 'lgt', 56, 'Marjane', 1510
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4915 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Fromage Vache qui rit', 'Units', 4843, 'MPC- Fromage Vache qui rit', 'lgt', 49, 'Carrefour Market', 1520
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4843 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Mozzarella', 'kg', 4954, 'MPC- Mozzarella', 'lgt', 56, 'Marjane', 1530
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4954 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Oeufs entier', 'pack 2 kg', 909, 'MPC- Oeufs entier', 'lgt', 6831, 'Frais caprices', 1540
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 909 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Oeufs plateau (30)', 'Units', 3791, 'MPC- Oeufs plateau (30)', 'lgt', 56, 'Marjane', 1550
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3791 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Straciatella', 'kg', 5035, 'MPC- Straciatella', 'lgt', 8616, 'Pasta Di Luigi', 1560
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5035 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Yaourt', 'g', 5058, 'MPC- Yaourt', 'lgt', 49, 'Carrefour Market', 1570
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Crèmerie, fromages & œufs'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5058 AND a.odoo_source = 'lgt');

--    Épices & graines : 15
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Ail Semoule', 'g', 4906, 'MPC- Ail Semoule', 'lgt', 56, 'Marjane', 1580
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4906 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Cannelle', 'g', 797, 'MPC- Cannelle', 'lgt', 8619, 'Zohour Atlas Nait Balla', 1590
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 797 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Cumin', 'pack 250 g', 4714, 'MPC- Cumin', 'lgt', 56, 'Marjane', 1600
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4714 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Epice Shawarma', 'pack 250 g', 4885, 'MPC- Epice Shawarma', 'lgt', 56, 'Marjane', 1610
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4885 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Gingembre Moulu', 'g', 3103, 'MPC- Gingembre Moulu', 'lgt', 56, 'Marjane', 1620
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3103 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Grain d''anis', 'pack 500 g', 4258, 'MPC- Grain d''anis', 'lgt', 49, 'Carrefour Market', 1630
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4258 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Multigrains', 'g', 2709, 'MPC- Multigrains', 'lgt', 8619, 'Zohour Atlas Nait Balla', 1640
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2709 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Oignon Semoule', 'g', 4913, 'MPC- Oignon Semoule', 'lgt', 56, 'Marjane', 1650
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4913 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Paprika Fumé', 'pack 125 g', 4981, 'MPC- Paprika Fumé', 'lgt', 56, 'Marjane', 1660
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4981 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pavot', 'kg', 3567, 'MPC- Pavot', 'lgt', 68, 'Vrac', 1670
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3567 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Piment rouge moulu', 'pack 100 g', 4916, 'MPC- Piment rouge moulu', 'lgt', 56, 'Marjane', 1680
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4916 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Poivre moulu', 'pack 250 g', 4909, 'MPC- Poivre moulu', 'lgt', 56, 'Marjane', 1690
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4909 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sésame Blanc', 'kg', 4961, 'MPC- Sésame Blanc', 'lgt', 8619, 'Zohour Atlas Nait Balla', 1700
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4961 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sésame Jaune', 'kg', 5024, 'MPC- Sésame Jaune', 'lgt', 68, 'Vrac', 1710
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5024 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sésame Noir', 'kg', 4918, 'MPC- Sésame Noir', 'lgt', 68, 'Vrac', 1720
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épices & graines'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4918 AND a.odoo_source = 'lgt');

--    Sauces, huiles & conserves : 16
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Bouillon', 'Units', 4773, 'MPC- Bouillon', 'lgt', 56, 'Marjane', 1730
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4773 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Champignon Noir', 'kg', 4813, 'MPC- Champignon Noir', 'lgt', 56, 'Marjane', 1740
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4813 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Champignons Conserve', 'kg', 4945, 'MPC- Champignons Conserve', 'lgt', 56, 'Marjane', 1750
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4945 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Citron confit', 'kg', 4777, 'MPC- Citron confit', 'lgt', 56, 'Marjane', 1760
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4777 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Cornichon', 'kg', 4949, 'MPC- Cornichon', 'lgt', 56, 'Marjane', 1770
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4949 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Crème Balsamique', 'Units', 4725, 'MPC- Crème Balsamique', 'lgt', 56, 'Marjane', 1780
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4725 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Huile d''olive', 'pack 2 kg', 4953, 'MPC- Huile d''olive', 'lgt', 56, 'Marjane', 1790
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4953 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Huile de tournesol', 'pack 5 kg', 880, 'MPC- Huile de tournesol', 'lgt', 56, 'Marjane', 1800
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 880 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Ketchup', 'g', 5099, 'MPC- Ketchup', 'lgt', 56, 'Marjane', 1810
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5099 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Mais', 'g', 5032, 'MPC- Mais', 'lgt', 56, 'Marjane', 1820
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5032 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Mayonnaise', 'g', 5033, 'MPC- Mayonnaise', 'lgt', 56, 'Marjane', 1830
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5033 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Moutarde', 'Units', 4794, 'MPC- Moutarde', 'lgt', 56, 'Marjane', 1840
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4794 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Olive noire', 'kg', 4957, 'MPC- Olive noire', 'lgt', 56, 'Marjane', 1850
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4957 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sauce Hoi Sin', 'Units', 4886, 'MPC- Sauce Hoi Sin', 'lgt', 56, 'Marjane', 1860
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4886 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sauce Soja', 'g', 4938, 'MPC- Sauce Soja', 'lgt', 56, 'Marjane', 1870
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4938 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Sauce Tabasco Sriracha', 'Units', 4860, 'MPC- Sauce Tabasco Sriracha', 'lgt', 56, 'Marjane', 1880
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Sauces, huiles & conserves'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4860 AND a.odoo_source = 'lgt');

--    Épicerie sèche : 10
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Dattes Mejhoule', 'kg', 5046, 'MPC- Dattes Mejhoule', 'lgt', 4029, 'Nait hamou', 1890
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5046 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Farine', 'pack 10 kg', 4543, 'MPC- Farine', 'lgt', 56, 'Marjane', 1900
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4543 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Feuille Pastilla', 'kg', 4856, 'MPC- Feuille Pastilla', 'lgt', 68, 'Vrac', 1910
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4856 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Flocons d''avoine', 'kg', 4768, 'MPC- Flocons d''avoine', 'lgt', 8619, 'Zohour Atlas Nait Balla', 1920
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4768 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Levure fraiche', 'pack 500 g', 889, 'MPC- Levure fraiche', 'lgt', 49, 'Carrefour Market', 1930
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 889 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Miel Dar El AASSAL', 'kg', 4803, 'MPC- Miel Dar El AASSAL', 'lgt', 56, 'Marjane', 1940
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4803 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pâte feuilletée achetée', 'pack 20 u', 922, 'MPC- Pâte feuilletée achetée', 'lgt', 47, 'BLE GOURMET', 1950
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 922 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Pistache Entière', 'kg', 927, 'MPC- Pistache Entière', 'lgt', 8619, 'Zohour Atlas Nait Balla', 1960
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 927 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Semoule fine', 'pack 10 kg', 4091, 'MPC- Semoule fine', 'lgt', 56, 'Marjane', 1970
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4091 AND a.odoo_source = 'lgt');
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Tortilla 30cm', 'Units', 4914, 'MPC- Tortilla 30cm', 'lgt', 8611, 'Achibest', 1980
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Épicerie sèche'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4914 AND a.odoo_source = 'lgt');

--    Divers : 1
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, odoo_source, fournisseur_odoo_id, fournisseur_nom, display_order)
SELECT c.id, gr.id, 'Bouteille Gaz', 'Units', 4876, 'MPC- Bouteille Gaz', 'lgt', 68, 'Vrac', 1990
FROM economat_categories c
LEFT JOIN economat_groups gr ON gr.category_id = c.id AND gr.name = 'Divers'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4876 AND a.odoo_source = 'lgt');

-- 3) Vérification
SELECT gr.name AS famille, count(*) AS articles
FROM economat_articles a
JOIN economat_categories c ON c.id = a.category_id AND c.name = 'Cuisine'
LEFT JOIN economat_groups gr ON gr.id = a.group_id
WHERE a.odoo_source = 'lgt'
GROUP BY gr.name ORDER BY gr.name;

SELECT fournisseur_nom, count(*) AS articles
FROM economat_articles WHERE odoo_source = 'lgt'
GROUP BY fournisseur_nom ORDER BY count(*) DESC;
