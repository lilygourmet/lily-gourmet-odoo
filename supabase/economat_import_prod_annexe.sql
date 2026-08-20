-- ============================================================
-- ÉCONOMAT — 3 nouvelles catégories créées à partir des habitudes réelles
--
-- Source : transferts Odoo « achat -> prod annexe » (Entrepôt Achats
-- Principal), année 2026, transferts terminés :
--   Chocolat : Pers. BOUCHTA BHILILI  (68 transferts)
--   Ménage   : pers.souad idari       (32 transferts)
--   Cuisine  : Pers.zakia el araoui   (86 transferts)
-- Articles retenus par Layla dans la liste à cocher.
--
-- Le script est REJOUABLE : relancé deux fois, il ne crée pas de doublon.
-- ============================================================

-- 1) Catégories
INSERT INTO economat_categories (name, display_order)
SELECT 'Chocolat', 50
WHERE NOT EXISTS (SELECT 1 FROM economat_categories WHERE name = 'Chocolat');
INSERT INTO economat_categories (name, display_order)
SELECT 'Ménage', 60
WHERE NOT EXISTS (SELECT 1 FROM economat_categories WHERE name = 'Ménage');
INSERT INTO economat_categories (name, display_order)
SELECT 'Cuisine', 70
WHERE NOT EXISTS (SELECT 1 FROM economat_categories WHERE name = 'Cuisine');

-- 2) Groupes (rangement à l'intérieur de chaque catégorie)
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Chocolats', 10 FROM economat_categories c
WHERE c.name = 'Chocolat'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Matières premières', 20 FROM economat_categories c
WHERE c.name = 'Chocolat'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Consommables', 30 FROM economat_categories c
WHERE c.name = 'Chocolat'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Emballages', 40 FROM economat_categories c
WHERE c.name = 'Chocolat'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Consommables', 10 FROM economat_categories c
WHERE c.name = 'Ménage'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Chocolats', 10 FROM economat_categories c
WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Matières premières', 20 FROM economat_categories c
WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Consommables', 30 FROM economat_categories c
WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;
INSERT INTO economat_groups (category_id, name, display_order)
SELECT c.id, 'Emballages', 40 FROM economat_categories c
WHERE c.name = 'Cuisine'
ON CONFLICT (category_id, name) DO NOTHING;

-- 3) Articles (103)

--    Chocolat : 42 articles
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Macao Blanc', 'kg', 5972, 'Chocolat Macao Blanc', 10
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5972);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Callebaut Couverture Lait', 'pack 2,5 kg', 5821, 'Chocolat Callebaut Couverture Lait', 20
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5821);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Callebaut Couverture Gold', 'pack 2,5 kg', 5822, 'Chocolat Callebaut Couverture Gold', 30
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5822);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat blanc Zephyr', 'pack 4 kg', 5974, 'Chocolat blanc Zephyr', 40
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5974);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Callebaut Couverture Noir', 'pack 2,5 kg', 5819, 'Chocolat Callebaut Couverture Noir', 50
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5819);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Callebaut Couverture Blanc', 'pack 2,5 kg', 5820, 'Chocolat Callebaut Couverture Blanc', 60
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5820);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Macao Noir', 'kg', 5973, 'Chocolat Macao Noir', 70
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5973);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Corn Flakes', 'Units', 6364, 'Corn Flakes', 80
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6364);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Miel Zemzami', 'pack 4,4 kg', 5980, 'Miel Zemzami', 90
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5980);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Lait UHT', 'kg', 5945, 'Lait UHT', 100
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5945);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Trimoline sucre inverti', 'pack 7 kg', 5983, 'Trimoline sucre inverti', 110
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5983);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sucre Glace', 'sac 5 kg', 5986, 'Sucre Glace', 120
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5986);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Amandes Poudre extra fine', 'kg', 5833, 'Amandes Poudre extra fine', 130
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5833);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Lait Concentré', 'Boite 369 g', 6001, 'Lait Concentré', 140
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6001);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Colorant Lypo Rose Framboise', 'pack 100 g', 3945, 'Colorant Lypo Rose Framboise', 150
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3945);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Pistache Entière', 'kg', 5963, 'Pistache Entière', 160
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5963);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Cacao Extra rouge', 'kg', 5953, 'Cacao Extra rouge', 170
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5953);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Gelatine en poudre', 'kg', 5955, 'Gelatine en poudre', 180
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5955);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Noix de Coco rapée', 'kg', 6155, 'Noix de Coco rapée', 190
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6155);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Riz soufflé', 'Pack de 375 G', 6163, 'Riz soufflé', 200
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6163);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Colorant Lypo rouge', 'pack 100 g', 819, 'Colorant Lypo rouge', 210
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 819);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sésame Jaune', 'g', 2115, 'Sésame Jaune', 220
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2115);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Amandes Brutes', 'pack 22,68 kg', 5834, 'Amandes Brutes', 230
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5834);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Crème Cacahuètes', 'kg', 6066, 'Crème Cacahuètes', 240
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6066);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Glucose', 'seau 5 kg', 5957, 'Glucose', 250
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5957);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Praliné Amande  50%', 'pack 4 kg', 5838, 'Praliné Amande  50%', 260
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5838);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Praliné Noisette 50%', 'pack 4 kg', 5839, 'Praliné Noisette 50%', 270
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5839);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Pâte de Noisette MONTEBIANCO', 'seau 3 kg', 6740, 'Pâte de Noisette MONTEBIANCO', 280
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6740);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Cure dent', 'Units', 2573, 'Cure dent', 290
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2573);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau Essuie Main', 'pack 6 u', 947, 'C- Rouleau Essuie Main', 300
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 947);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Brochette en bois', 'pack 100 u', 2578, 'C- Brochette en bois', 310
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2578);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau celophane', 'Units', 4172, 'C- Rouleau celophane', 320
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4172);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Gant latex noir 100 pcs', 'Units', 869, 'C- Gant latex noir 100 pcs', 330
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 869);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Papier cuisson', 'Units', 2906, 'C- Papier cuisson', 340
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2906);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Poche patissière petit', 'Units', 3887, 'C- Poche patissière petit', 350
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3887);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Sac plastique', 'kg', 3402, 'C- Sac plastique', 360
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3402);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Devant', 'Units', 4174, 'C- Devant', 370
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4174);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau Papier chocolat', 'Units', 6215, 'C- Rouleau Papier chocolat', 380
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6215);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite Tubo 60x120 imp', 'Units', 6511, 'Boite Tubo 60x120 imp', 390
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6511);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Socle doré 60/40 cm', 'Units', 4173, 'Socle doré 60/40 cm', 400
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4173);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sachet 8cm cookies', 'Units', 1961, 'Sachet 8cm cookies', 410
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 1961);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Bâtonnet Magnum', 'Pack 50 u', 759, 'Bâtonnet Magnum', 420
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Chocolat'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 759);

--    Ménage : 13 articles
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Sac poubelle 130l (Pack de 10)', 'Units', 2610, 'C- Sac poubelle 130l (Pack de 10)', 10
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2610);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Detergent', 'pack 4 l', 1892, 'C- Detergent', 20
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 1892);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Papier hygiènique Xtra large', 'pack 12 u', 3026, 'C- Papier hygiènique Xtra large', 30
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3026);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau Essuie Main', 'pack 6 u', 947, 'C- Rouleau Essuie Main', 40
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 947);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Tablette DST 1,7G', 'Units', 6033, 'C- Tablette DST 1,7G', 50
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6033);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Tablette TAB 0,5G', 'Units', 6034, 'C- Tablette TAB 0,5G', 60
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6034);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Tide', 'Units', 6684, 'C- Tide', 70
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6684);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Savon main 4L', 'pack 4 l', 6736, 'C- Savon main 4L', 80
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6736);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Gant latex noir 100 pcs', 'Units', 869, 'C- Gant latex noir 100 pcs', 90
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 869);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Devant', 'Units', 4174, 'C- Devant', 100
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4174);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Savon mains', 'pack 12 u', 2708, 'C- Savon mains', 110
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2708);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Charlottes pack de 100', 'Units', 804, 'C- Charlottes pack de 100', 120
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 804);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Savon main 5L', 'pack 4 l', 6414, 'C- Savon main 5L', 130
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Ménage'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6414);

--    Cuisine : 48 articles
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Valrhona Guanaja', 'pack 3 kg', 5825, 'Chocolat Valrhona Guanaja', 10
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5825);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Dulcey', 'pack 3 kg', 5979, 'Chocolat Dulcey', 20
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5979);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Valrhona Satilia lait 38%', 'pack 12 kg', 6159, 'Chocolat Valrhona Satilia lait 38%', 30
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6159);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chocolat Valrhona Satilia Noir 62%', 'pack 12 kg', 5840, 'Chocolat Valrhona Satilia Noir 62%', 40
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Chocolats'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5840);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Huile de tournesol', 'pack 4 kg', 5959, 'Huile de tournesol', 50
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5959);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Farine', 'kg', 4543, 'Farine', 60
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4543);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Lait UHT', 'kg', 5945, 'Lait UHT', 70
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5945);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sel', 'pack 500 g', 955, 'Sel', 80
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 955);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Vinaigre 50 cl', 'Units', 4181, 'Vinaigre 50 cl', 90
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4181);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sucre Granule', 'pack 2 kg', 4539, 'Sucre Granule', 100
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4539);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Amandes Poudre', 'kg', 5837, 'Amandes Poudre', 110
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5837);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sucre Glace', 'sac 5 kg', 5986, 'Sucre Glace', 120
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5986);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Amandes Hachees', 'kg', 5832, 'Amandes Hachees', 130
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5832);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Nescafe Special Filtre', 'Pack 190', 905, 'Nescafe Special Filtre', 140
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 905);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Cacao Extra rouge', 'kg', 5953, 'Cacao Extra rouge', 150
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5953);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Maizena', 'sac 5 kg', 5975, 'Maizena', 160
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5975);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Arôme vanille artificielle', 'kg', 6047, 'Arôme vanille artificielle', 170
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6047);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Sésame Jaune', 'g', 2115, 'Sésame Jaune', 180
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2115);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Chapelure', 'kg', 5306, 'Chapelure', 190
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5306);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Aiguilette orange', 'kg', 745, 'Aiguilette orange', 200
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 745);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Nido', 'kg', 4828, 'Nido', 210
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4828);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Bicarbonate de soude', 'pack 125 g', 767, 'Bicarbonate de soude', 220
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 767);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Noisette Entière', 'kg', 6160, 'Noisette Entière', 230
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6160);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Levure chimique', 'pack 4 kg', 5961, 'Levure chimique', 240
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5961);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Corn Flakes', 'Units', 6364, 'Corn Flakes', 250
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6364);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Amandes Effilees', 'kg', 5835, 'Amandes Effilees', 260
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 5835);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Vinaigre', 'kg', 6981, 'Vinaigre', 270
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Matières premières'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6981);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau Essuie Main', 'pack 6 u', 947, 'C- Rouleau Essuie Main', 280
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 947);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau celophane', 'Units', 4172, 'C- Rouleau celophane', 290
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4172);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Gant latex noir 100 pcs', 'Units', 869, 'C- Gant latex noir 100 pcs', 300
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 869);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Papier cuisson', 'Units', 2906, 'C- Papier cuisson', 310
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2906);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Charlottes pack de 100', 'Units', 804, 'C- Charlottes pack de 100', 320
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 804);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Devant', 'Units', 4174, 'C- Devant', 330
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4174);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Sac plastique', 'kg', 3402, 'C- Sac plastique', 340
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3402);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Brochette en bois', 'pack 100 u', 2578, 'C- Brochette en bois', 350
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2578);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'FS- Gingembre sec (Zakia)', 'kg', 3600, 'FS- Gingembre sec (Zakia)', 360
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3600);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Poche patissière 100 pcs', 'Units', 928, 'C- Poche patissière 100 pcs', 370
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 928);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'C- Rouleau Papier Aluminium', 'Units', 2900, 'C- Rouleau Papier Aluminium', 380
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Consommables'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2900);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Plateau rectangle avec clôche et fenêtre', 'Units', 3488, 'Plateau rectangle avec clôche et fenêtre', 390
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3488);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Pot noir 500gr', 'Units', 3448, 'Pot noir 500gr', 400
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 3448);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Plateaux avec cloche', 'Units', 2616, 'Plateaux avec cloche', 410
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 2616);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite kaki 26X21X7', 'Units', 4328, 'Boite kaki 26X21X7', 420
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4328);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite Tubo 60x120 imp', 'Units', 6511, 'Boite Tubo 60x120 imp', 430
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6511);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Barquette 750g', 'Units', 6148, 'Barquette 750g', 440
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 6148);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite polystyrène P16', 'Units', 775, 'Boite polystyrène P16', 450
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 775);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite kaki 16X14X7cm', 'Units', 4329, 'Boite kaki 16X14X7cm', 460
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4329);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Boite polystyrène P9', 'Units', 776, 'Boite polystyrène P9', 470
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 776);
INSERT INTO economat_articles (category_id, group_id, name, unit, odoo_product_id, odoo_name, display_order)
SELECT c.id, g.id, 'Socle doré 60/40 cm', 'Units', 4173, 'Socle doré 60/40 cm', 480
FROM economat_categories c
LEFT JOIN economat_groups g ON g.category_id = c.id AND g.name = 'Emballages'
WHERE c.name = 'Cuisine'
  AND NOT EXISTS (SELECT 1 FROM economat_articles a WHERE a.category_id = c.id AND a.odoo_product_id = 4173);

-- 4) Visibilité : on N'AJOUTE AUCUN BADGE. Les 3 catégories sont rattachées
--    au badge existant « Chocolat / Cuisine / Ménage », qui n'en avait aucune.
--    Pour que chacun ne voie que la sienne, décocher dans Économat -> Gérer ->
--    une catégorie -> « Visible par les profils ».
INSERT INTO economat_profil_categories (profil, category_id)
SELECT 'chocolat_cuisine_menage', c.id FROM economat_categories c WHERE c.name = 'Chocolat'
ON CONFLICT (profil, category_id) DO NOTHING;
INSERT INTO economat_profil_categories (profil, category_id)
SELECT 'chocolat_cuisine_menage', c.id FROM economat_categories c WHERE c.name = 'Ménage'
ON CONFLICT (profil, category_id) DO NOTHING;
INSERT INTO economat_profil_categories (profil, category_id)
SELECT 'chocolat_cuisine_menage', c.id FROM economat_categories c WHERE c.name = 'Cuisine'
ON CONFLICT (profil, category_id) DO NOTHING;

-- Vérification : nombre d'articles par catégorie
SELECT c.name, count(a.id) AS articles
FROM economat_categories c LEFT JOIN economat_articles a ON a.category_id = c.id
WHERE c.name IN ('Chocolat', 'Ménage', 'Cuisine')
GROUP BY c.name ORDER BY c.name;
