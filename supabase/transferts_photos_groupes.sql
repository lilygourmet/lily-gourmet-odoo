-- ============================================================
-- LILY GOURMET — Transferts : photos, classement et ménage
--   • photo de chaque article (site lily-gourmet.com, sinon photo Odoo)
--   • classement automatique : crèmes, glaçages, viennoiseries, entremets…
--   • les bûches (saison de Noël) sont masquées
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE transferts_articles ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE transferts_articles ADD COLUMN IF NOT EXISTS groupe    TEXT NOT NULL DEFAULT 'autre';

-- Classement des 127 articles
UPDATE transferts_articles SET groupe = 'autre' WHERE odoo_product_id IN (1963,977,1917,1945,5128,3004,3437,929,930,6513,6521,5277,3038,884);
UPDATE transferts_articles SET groupe = 'biscuit' WHERE odoo_product_id IN (3637,1931,1948,1967,1944,793,3632,1958,1959,5688,5415,5426,3563,5486,5686,5416,3562,3564,3655,1960,5687);
UPDATE transferts_articles SET groupe = 'chocolat' WHERE odoo_product_id IN (3636,2775,1954,2781,2193,2787,1711,872,1712,3306,3963,3964,6268,1659,6576);
UPDATE transferts_articles SET groupe = 'creme' WHERE odoo_product_id IN (3624,3620,2540,3395,2528,3633,2529);
UPDATE transferts_articles SET groupe = 'entremet' WHERE odoo_product_id IN (4671,5678,5677,4927,4926,3296,1962,2907,1942,4928,2164,2165,2908,1941,1939,1940,5733,2594,2923,5734,5735,2595,3077,2909,1938,3896,2130,5610,4187,6356,6346,6351,6349,4070);
UPDATE transferts_articles SET groupe = 'fruit' WHERE odoo_product_id IN (5644,6844,6843,5642,2779,6842,2772,1920,2785,3304,6520,6575);
UPDATE transferts_articles SET groupe = 'glacage' WHERE odoo_product_id IN (1952,1921,2190);
UPDATE transferts_articles SET groupe = 'matiere' WHERE odoo_product_id IN (5939,5941,5985,5977,5940,5834,5963,845,5942,745);
UPDATE transferts_articles SET groupe = 'viennoiserie' WHERE odoo_product_id IN (2935,4428,2929,5611,6769,5222,3435,3436,2932,3355,3574);

-- Photos (32 articles : site lily-gourmet.com, sinon photo Odoo)
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4467/image_256' WHERE odoo_product_id = 5644;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/5258/image_256' WHERE odoo_product_id = 6844;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/5258/image_256' WHERE odoo_product_id = 6843;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4467/image_256' WHERE odoo_product_id = 5642;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4499/image_256' WHERE odoo_product_id = 5678;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4499/image_256' WHERE odoo_product_id = 5677;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/5258/image_256' WHERE odoo_product_id = 6842;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2192/image_256' WHERE odoo_product_id = 2907;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2185/image_256' WHERE odoo_product_id = 1942;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2187/image_256' WHERE odoo_product_id = 2164;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2170/image_256' WHERE odoo_product_id = 2193;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2152/image_256' WHERE odoo_product_id = 1931;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2185/image_256' WHERE odoo_product_id = 1941;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2170/image_256' WHERE odoo_product_id = 872;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2150/image_256' WHERE odoo_product_id = 793;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2152/image_256' WHERE odoo_product_id = 5415;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4217/image_256' WHERE odoo_product_id = 5222;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4377/image_256' WHERE odoo_product_id = 5486;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4876/image_256' WHERE odoo_product_id = 6268;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2150/image_256' WHERE odoo_product_id = 5416;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/4499/image_256' WHERE odoo_product_id = 5610;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/1493/image_256' WHERE odoo_product_id = 3355;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2156/image_256' WHERE odoo_product_id = 1659;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/5090/image_256' WHERE odoo_product_id = 6576;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/5089/image_256' WHERE odoo_product_id = 6575;
UPDATE transferts_articles SET image_url = 'https://lily-gourmet.com/web/image/product.template/2999/image_256' WHERE odoo_product_id = 3038;

-- Bûches masquées (5) — réaffichables depuis l'app
UPDATE transferts_articles SET actif = false WHERE odoo_product_id IN (4187,6356,6346,6351,6349);
