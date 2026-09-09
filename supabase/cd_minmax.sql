-- ============================================================
-- Mini / maxi des articles CD*, tenus par l'APP et non plus par Odoo.
--
-- Pourquoi : les règles de réapprovisionnement d'Odoo relançaient les mêmes
-- fabrications chaque matin — 6 451 ordres ouverts, dont certains de 2022, et
-- le même gâteau affiché deux fois dans Fabrication CD. L'app reprend la main :
-- elle lit ces valeurs, et ne crée un ordre que s'il n'y en a pas déjà un
-- d'ouvert pour cet article.
--
-- Les 37 lignes ci-dessous sont EXACTEMENT celles qui étaient dans Odoo le
-- 2026-09-08, avant que ses 55 règles CD* soient effacées.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS cd_minmax (
  produit    TEXT PRIMARY KEY,          -- nom exact de l'article dans Odoo
  mini       NUMERIC NOT NULL DEFAULT 0,
  maxi       NUMERIC NOT NULL DEFAULT 0,
  unite      TEXT,
  actif      BOOLEAN NOT NULL DEFAULT true,
  maj_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_par    UUID REFERENCES profiles(id)
);

ALTER TABLE cd_minmax ENABLE ROW LEVEL SECURITY;

-- ⚠️ « anon » EN PLUS de « authenticated » : l'app a son propre système de
-- comptes, le navigateur parle donc à Supabase avec la clé ANONYME. Une table
-- ouverte aux seuls « authenticated » ne rend RIEN au navigateur — et sans la
-- moindre erreur, juste une liste vide. C'est la convention de `prod_of_faits`.
-- L'écran de modification, lui, est réservé aux admins côté app.
DROP POLICY IF EXISTS cd_minmax_all ON cd_minmax;
CREATE POLICY cd_minmax_all ON cd_minmax
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Les valeurs reprises d'Odoo. ON CONFLICT DO NOTHING : relancer ce fichier
-- n'écrase JAMAIS une valeur que Layla aurait changée entre-temps.
INSERT INTO cd_minmax (produit, mini, maxi, unite) VALUES
  ('15 cm CD* (Chocolat)', 5, 12, 'u'),
  ('15 cm CD* (Citron)', 3, 10, 'u'),
  ('15 cm CD* (Oréo)', 4, 6, 'u'),
  ('15 cm CD* (Praliné Amandes caramélisées)', 9, 25, 'u'),
  ('15 cm CD* (Praliné Chocolaté)', 8, 19, 'u'),
  ('15 cm CD* (Vanille)', 7, 14, 'u'),
  ('20 cm CD* (Chocolat)', 7, 14, 'u'),
  ('20 cm CD* (Citron)', 5, 10, 'u'),
  ('20 cm CD* (Oréo)', 3, 10, 'u'),
  ('20 cm CD* (Praliné Amandes caramélisées)', 12, 25, 'u'),
  ('20 cm CD* (Praliné Chocolaté)', 9, 20, 'u'),
  ('20 cm CD* (Vanille)', 7, 16, 'u'),
  ('25 cm CD* (Chocolat)', 3, 6, 'u'),
  ('25 cm CD* (Citron)', 2, 4, 'u'),
  ('25 cm CD* (Oréo)', 2, 4, 'u'),
  ('25 cm CD* (Praliné Amandes caramélisées)', 5, 18, 'u'),
  ('25 cm CD* (Praliné Chocolaté)', 4, 10, 'u'),
  ('25 cm CD* (Vanille)', 3, 6, 'u'),
  ('30 cm CD* (Chocolat)', 1, 1, 'u'),
  ('30 cm CD* (Citron)', 1, 1, 'u'),
  ('30 cm CD* (Oréo)', 1, 1, 'u'),
  ('30 cm CD* (Praliné Amandes caramélisées)', 3, 5, 'u'),
  ('30 cm CD* (Praliné Chocolaté)', 2, 4, 'u'),
  ('30 cm CD* (Vanille)', 2, 4, 'u'),
  ('SM CD* Amandes Caramélisées', 1, 3.65, 'kg'),
  ('SM CD* Base Mini cupcake Chocolat accs', 100, 300, 'u'),
  ('SM CD* Base Mini cupcake Vanille accs', 100, 300, 'u'),
  ('SM CD* Base grand cupcake Chocolat accs', 100, 196, 'u'),
  ('SM CD* Base grand cupcake Vanille accs', 100, 196, 'u'),
  ('SM CD* Boule Cake pops accs (Caramel)', 60, 90, 'u'),
  ('SM CD* Boule Cake pops accs (Nutella)', 60, 90, 'u'),
  ('SM CD* Crème au beurre CBS STK', 0.6, 2, 'kg'),
  ('SM CD* Crème au beurre Chocolat STK', 1, 3, 'kg'),
  ('SM CD* Crème au beurre Vanille STK', 1, 3, 'kg'),
  ('SM CD* Magnum CBS accs', 60, 90, 'u'),
  ('SM CD* Magnum Nut accs', 60, 90, 'u'),
  ('SM CD* Sirop imbibage kg', 5, 11.1, 'kg')
ON CONFLICT (produit) DO NOTHING;
