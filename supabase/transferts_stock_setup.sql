-- ============================================================
-- LILY GOURMET — Transferts de stock entre PROD ANNEXE et PROD BOUTIQUE
--   • les deux sens (annexe → boutique ET boutique → annexe)
--   • deux familles : « mp » (matières premières) et « sm » (produits)
--   • chaque ligne est reliée à un produit Odoo (odoo_product_id)
-- À exécuter dans Supabase (SQL editor) AVANT de déployer. Relançable sans risque.
-- ============================================================

-- 1) La table existante s'ouvre aux deux sens et aux produits Odoo.
--    Les lignes déjà enregistrées restent valables (sens et famille par défaut).
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS sens            TEXT NOT NULL DEFAULT 'annexe_boutique';
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS famille         TEXT NOT NULL DEFAULT 'mp';
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS odoo_product_id INTEGER;
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS unite           TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS odoo_picking_id   INTEGER;   -- transfert Odoo créé à la réception
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS odoo_picking_name TEXT;
ALTER TABLE transferts_mp ADD COLUMN IF NOT EXISTS odoo_error        TEXT;      -- si Odoo a refusé (on garde la trace)
CREATE INDEX IF NOT EXISTS idx_transferts_mp_sens ON transferts_mp (sens, famille);

-- 2) Les articles proposés dans les listes : ceux réellement transférés dans
--    Odoo ces 5 derniers mois. On peut en ajouter d'autres depuis l'app.
CREATE TABLE IF NOT EXISTS transferts_articles (
  odoo_product_id INTEGER PRIMARY KEY,
  nom             TEXT NOT NULL,
  unite           TEXT NOT NULL DEFAULT 'kg',
  famille         TEXT NOT NULL DEFAULT 'sm',        -- 'mp' | 'sm'
  nb_transferts   INTEGER NOT NULL DEFAULT 0,        -- fréquence sur 5 mois (tri des vignettes)
  actif           BOOLEAN NOT NULL DEFAULT true,
  ajoute_par      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transferts_articles ENABLE ROW LEVEL SECURITY;
DO 30486 BEGIN
  CREATE POLICY "all transferts_articles" ON transferts_articles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END 30486;

-- 3) Les 127 articles transférés entre les deux prods (Odoo, 5 derniers mois).
INSERT INTO transferts_articles (odoo_product_id, nom, unite, famille, nb_transferts) VALUES
  (4671, 'SM- flan vanille 20 cm', 'Units', 'sm', 115),
  (5644, 'SM-Pr  Pistache fleur d''oranger indiv', 'Units', 'sm', 65),
  (6844, 'Sm- PR Le Citron Framboise (10)', 'Units', 'sm', 65),
  (6843, 'Sm- PR Le Citron Framboise (5)', 'Units', 'sm', 58),
  (3624, 'SM. Creme au beurre Vanille Production vitrine', 'g', 'sm', 57),
  (5642, 'SM- Pr Pistache fleur d''oranger 10 pers', 'Units', 'sm', 54),
  (3620, 'SM. Creme au beurre nature production', 'g', 'sm', 52),
  (3636, 'SM. Amandes Caramelisees Production', 'g', 'sm', 44),
  (3637, 'SM. Genoise Vanille KG Production archive', 'g', 'sm', 43),
  (5678, 'SM- Pr Cheesecake Exotique indiv', 'Units', 'sm', 42),
  (2779, 'SM- 20 cm Vitrine (Citron)', 'Units', 'sm', 41),
  (5677, 'SM- Pr Cheesecake Exotique 10 pers', 'Units', 'sm', 41),
  (4927, 'Sm- Pr tarte cbs 18 cm', 'Units', 'sm', 36),
  (4926, 'Sm- Pr tarte cbs indiv', 'Units', 'sm', 35),
  (5939, 'MP- Oeufs blanc', 'kg', 'mp', 34),
  (5941, 'MP- Oeufs jaune', 'kg', 'mp', 33),
  (2775, 'SM- 15 cm Vitrine (Praliné Amandes caramélisées)', 'Units', 'sm', 32),
  (3296, 'SM- cadre foret noir grand Production', 'Units', 'sm', 31),
  (5985, 'MP- Crème whipping', 'kg', 'mp', 31),
  (6842, 'Sm- PR Le Citron Framboise (1)', 'Units', 'sm', 28),
  (2935, 'SM- Pain au Chocolat', 'Units', 'sm', 26),
  (4428, 'SM- Pain Suisse', 'Units', 'sm', 26),
  (2929, 'SM- Croissant', 'Units', 'sm', 26),
  (5611, 'SM-Pain raisin', 'Units', 'sm', 26),
  (1962, 'SM- Cheesecake nature', 'Units', 'sm', 25),
  (5977, 'MP- Mascarpone', 'kg', 'mp', 25),
  (1954, 'SM. caramel beurre sale production', 'g', 'sm', 23),
  (2907, 'SM- Tiramisu indiv', 'Units', 'sm', 22),
  (1942, 'SM- Royal Chocolat 20 cm', 'Units', 'sm', 22),
  (5940, 'MP- Oeufs entier', 'kg', 'mp', 22),
  (4928, 'Sm- Pr tarte cbs 23 cm', 'Units', 'sm', 21),
  (2781, 'SM- 20 cm Vitrine (Praliné Amandes caramélisées)', 'Units', 'sm', 21),
  (2164, 'SM- cadre supreme amande production', 'Units', 'sm', 21),
  (2772, 'SM- 15 cm Vitrine (Citron)', 'Units', 'sm', 20),
  (2193, 'SM- Gianduja 10 pers', 'Units', 'sm', 20),
  (1931, 'SM- Cake citron', 'Units', 'sm', 20),
  (2165, 'SM- cadre citron meringuée Production', 'Units', 'sm', 20),
  (1948, 'SM- Cake Orange', 'Units', 'sm', 19),
  (1920, 'SM. Confit de framboise finition', 'g', 'sm', 17),
  (1967, 'SM Genoise Chocolat KG CD', 'g', 'sm', 16),
  (2908, 'SM- Tiramisu 15cm', 'Units', 'sm', 14),
  (1941, 'SM- Royal Chocolat 15 cm', 'Units', 'sm', 13),
  (1939, 'SM- Tarte citron gin 18 cm', 'Units', 'sm', 12),
  (1944, 'SM. Pate a choux unite', 'Units', 'sm', 11),
  (1940, 'SM- Tarte citron gin 23 cm', 'Units', 'sm', 11),
  (2787, 'SM- 25 cm Vitrine (Praliné Amandes caramélisées)', 'Units', 'sm', 11),
  (5733, 'SM- cadre supreme amande triangle production', 'Units', 'sm', 11),
  (2594, 'SM- mini Fond de tarte nature', 'Units', 'sm', 11),
  (1963, 'SM- Dark Choco', 'Units', 'sm', 10),
  (6769, 'SM- Donuts Maison 2026', 'Units', 'sm', 10),
  (1711, 'RA- Chocolat sellou (1)', 'Units', 'sm', 9),
  (872, 'SM- Gianduja indiv', 'Units', 'sm', 9),
  (2923, 'SM- Fond de tarte nature 23 cm', 'Units', 'sm', 9),
  (5734, 'SM- cadre citron  triangle production', 'Units', 'sm', 9),
  (1712, 'RA- Chocolat Nougat (1)', 'Units', 'sm', 9),
  (2785, 'SM- 25 cm Vitrine (Citron)', 'Units', 'sm', 9),
  (5735, 'SM- cadre chocolat  triangle production', 'Units', 'sm', 9),
  (2595, 'SM- mini Fond de tarte cacao', 'Units', 'sm', 9),
  (977, 'SM- Tatin Indiv', 'Units', 'sm', 8),
  (793, 'SM- Cake chocolat', 'Units', 'sm', 8),
  (3077, 'SM- Fond de tarte nature 8 cm', 'Units', 'sm', 8),
  (3632, 'SM. pate de vanille maison', 'g', 'sm', 8),
  (1952, 'SM. glacage mirroir Finition', 'g', 'sm', 7),
  (3306, 'SM- 30 cm Vitrine (Praliné Amandes caramélisées)', 'Units', 'sm', 6),
  (2909, 'SM- Tiramisu 20cm', 'Units', 'sm', 6),
  (1938, 'SM- Tarte citron gin Indiv', 'Units', 'sm', 6),
  (1917, 'SM-Daquoise Individuelle', 'Units', 'sm', 6),
  (1958, 'SM- Cookies CH N', 'Units', 'sm', 6),
  (1945, 'SM. craquelin', 'g', 'sm', 5),
  (5834, 'MP- Amandes Brutes', 'kg', 'mp', 5),
  (3963, 'Sm.crunchy gianduja 10 pers/ U', 'Units', 'sm', 4),
  (3964, 'Sm. crunchy gianduja indiv pers/ U', 'Units', 'sm', 4),
  (1959, 'SM- Cookies ch L', 'Units', 'sm', 4),
  (2540, 'SM. creme amande', 'g', 'sm', 4),
  (3395, 'SM. creme citron Production', 'g', 'sm', 3),
  (3304, 'SM- 30 cm Vitrine (Citron)', 'Units', 'sm', 3),
  (5688, 'SM. mini cheese cake aromatisé (Mangue/Passion)', 'Units', 'sm', 3),
  (5415, 'SM- Cake citron Individuel', 'Units', 'sm', 3),
  (5426, 'SM- Cake praliné individuel', 'Units', 'sm', 3),
  (3896, 'SM- cadre supreme amande mignardise production', 'Units', 'sm', 3),
  (5222, 'SM- mini  Pain Suisse', 'Units', 'sm', 2),
  (3563, 'SM. Mini cakes CITRON', 'cl', 'sm', 2),
  (5128, 'SM- Paris brest cuits  production', 'Units', 'sm', 2),
  (1921, 'SM. Glacage chocolat GIANDUJA Finition', 'g', 'sm', 2),
  (5486, 'GS- Ghriba Chocolat', 'Units', 'sm', 2),
  (2130, 'SM- Fond de tarte nature 18 cm', 'Units', 'sm', 2),
  (5686, 'SM. mini cheese cake aromatisé (Ananas)', 'Units', 'sm', 2),
  (3004, 'SM-mini Daquoise', 'Units', 'sm', 2),
  (6268, 'GM- Barre chocolatée Noël', 'Units', 'sm', 2),
  (5963, 'MP- Pistache Entière', 'kg', 'mp', 2),
  (5416, 'SM- Cake Chocolat Individuel', 'Units', 'sm', 2),
  (3435, 'SM- Micro Croissants', 'Units', 'sm', 1),
  (3436, 'SM. Micro Pain au chocolat', 'Units', 'sm', 1),
  (3437, 'SM. Micro Pain aux raisins', 'Units', 'sm', 1),
  (2932, 'SM. Mini Croissant', 'Units', 'sm', 1),
  (3562, 'SM. Mini cakes CHOCOLAT', 'cl', 'sm', 1),
  (3564, 'SM. Mini cakes PRALINE', 'cl', 'sm', 1),
  (2190, 'SM. Glacage gourmand Finition', 'g', 'sm', 1),
  (929, 'C- Polystyrène 2 cm', 'g', 'sm', 1),
  (930, 'C- Polystyrène 5 cm', 'g', 'sm', 1),
  (5610, 'SM- Cheesecake Exotique 10 pers', 'Units', 'sm', 1),
  (6513, 'SM- Babka', 'Units', 'sm', 1),
  (3355, 'SM- Brioche FEUILLETE', 'Units', 'sm', 1),
  (4187, 'SM- Buche Supreme Indiv Prod 2024', 'Units', 'sm', 1),
  (3655, 'SM- Mini Browcookie', 'Units', 'sm', 1),
  (6356, 'SM- Pr Buche  passion framboise indiv  25', 'Units', 'sm', 1),
  (6346, 'SM- Pr Buche noisette dulcey indiv 25', 'Units', 'sm', 1),
  (6351, 'SM- Pr Buche pistache 10 pers 25', 'Units', 'sm', 1),
  (6349, 'SM- Pr Buche pistache indiv 25', 'Units', 'sm', 1),
  (845, 'MP- Donut nature', 'Units', 'mp', 1),
  (2528, 'SM. creme patissiere citron finition', 'g', 'sm', 1),
  (3633, 'SM. creme patissiere praline Finition', 'g', 'sm', 1),
  (2529, 'SM. creme patissiere cbs finition', 'g', 'sm', 1),
  (6521, 'SM. Farce Kunafa Bueno', 'g', 'sm', 1),
  (6520, 'SM. Farce Kunafa Pistache 2026', 'kg', 'sm', 1),
  (1659, '[135] E- Cheese Caramel Beurre Salé (1)', 'Units', 'sm', 1),
  (1960, 'SM- Cookies ch B', 'Units', 'sm', 1),
  (6576, 'RA- Chocolat Sellou Caramel Croustillant (400g)', 'Units', 'sm', 1),
  (6575, 'RA- Chocolat Guimauve à la Fleur d''Oranger (300g)', 'Units', 'sm', 1),
  (5687, 'SM. mini cheese cake aromatisé (Fruits Rouges)', 'Units', 'sm', 1),
  (4070, 'SM- cadre foret noir mignardise Production', 'Units', 'sm', 1),
  (5942, 'MP- Beurre entremets', 'kg', 'mp', 1),
  (3574, 'SM. Ganache Chocolat BRIOCHE / TARTE', 'g', 'sm', 1),
  (745, 'MP- Aiguilette orange', 'g', 'mp', 1),
  (5277, 'Oeufs plateau (30 pièces)', 'Units', 'sm', 1),
  (3038, 'RA- Sucette Guimauve', 'Units', 'sm', 1),
  (884, 'SM Fourrage Sellou CD', 'g', 'sm', 1)
ON CONFLICT (odoo_product_id) DO UPDATE SET nb_transferts = EXCLUDED.nb_transferts, nom = EXCLUDED.nom, unite = EXCLUDED.unite;

-- 4) Numéros WhatsApp prévenus qu'un transfert attend une confirmation
--    (à remplir dans l'app : écran Transferts → ⚙ Réglages).
INSERT INTO app_config (key, value) VALUES
  ('transfert_wa_boutique', ''),   -- prévenu quand l'ANNEXE envoie vers la boutique
  ('transfert_wa_annexe',   '')    -- prévenu quand la BOUTIQUE envoie vers l'annexe
ON CONFLICT (key) DO NOTHING;
