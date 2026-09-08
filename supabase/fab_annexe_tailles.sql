-- ============================================================
-- « Fabrication Annexe 2 » : les tailles d'une même recette.
--
-- Une tournée, c'est UNE CUVE de mousse. On la monte dans la taille lancée et
-- ce qui reste finit dans les tailles PLUS PETITES — jamais plus grandes :
-- d'un 10 pers on peut finir en 5 pers et en individuels, d'un 5 pers seulement
-- en individuels. (Règle de Layla, 2026-09-07.)
--
-- D'où deux colonnes : la famille (qui va avec qui) et le rang (qui est plus
-- grand que qui). À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

ALTER TABLE fab_annexe_articles
  ADD COLUMN IF NOT EXISTS famille TEXT,
  ADD COLUMN IF NOT EXISTS rang    INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN fab_annexe_articles.famille IS
  'Les articles qui se montent dans la même cuve. NULL = seul de sa famille.';
COMMENT ON COLUMN fab_annexe_articles.rang IS
  'Plus le rang est haut, plus la pièce est grande. On ne finit jamais dans un rang supérieur.';

UPDATE fab_annexe_articles
   SET famille = 'tiramisu', rang = 1
 WHERE produit = 'SM- Tiramisu indiv';

-- ------------------------------------------------------------
-- ⚠️ Les deux autres tailles attendent les vrais chiffres de Layla :
--    mini, maxi et surtout LA TAILLE DE TOURNÉE (combien de pièces sort
--    une cuve montée en 20 cm ? en 15 cm ?).
--    Décommenter et compléter quand ils seront connus.
-- ------------------------------------------------------------
-- INSERT INTO fab_annexe_articles (produit, libelle, photo, mini, maxi, tournee,
--                                  figes, figes_nom, famille, rang)
-- VALUES
--   ('SM- Tiramisu 20cm', 'Tiramisu 20 cm · 10 pers', 'E- Tiramisu',
--    ?, ?, ?,
--    ARRAY['MP- Mascarpone','MP- Crème whipping','MP- Oeufs jaune',
--          'MP- Sucre Granule','MP- Gelatine en poudre','MP- Eau robinet'],
--    'La mousse', 'tiramisu', 3),
--   ('SM- Tiramisu 15cm', 'Tiramisu 15 cm · 5 pers', 'E- Tiramisu',
--    ?, ?, ?,
--    ARRAY['MP- Mascarpone','MP- Crème whipping','MP- Oeufs jaune',
--          'MP- Sucre Granule','MP- Gelatine en poudre','MP- Eau robinet'],
--    'La mousse', 'tiramisu', 2)
-- ON CONFLICT (produit) DO NOTHING;
