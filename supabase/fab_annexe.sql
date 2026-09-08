-- ============================================================
-- Onglet « Fabrication Annexe 2 » : le catalogue des articles suivis.
-- On travaille article par article — chaque ligne ajoutée ici fait
-- apparaître l'article dans l'écran dès qu'il passe sous son mini.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS fab_annexe_articles (
  -- Le nom EXACT de l'article dans Odoo. C'est la clé : c'est par lui qu'on
  -- retrouve le stock et la nomenclature.
  produit  TEXT PRIMARY KEY,

  -- Ce que le pâtissier lit à l'écran, et la photo à afficher. La photo vient
  -- souvent du produit VENDU (« E- Tiramisu ») et non du demi-produit fabriqué,
  -- qui n'en a pas.
  libelle  TEXT,
  photo    TEXT,

  -- Sous le mini, l'article apparaît. Au-dessus, il disparaît de l'écran.
  mini     NUMERIC NOT NULL,
  maxi     NUMERIC NOT NULL,

  -- On ne fabrique jamais « ce qui manque » : toujours une tournée entière.
  tournee  NUMERIC NOT NULL,

  -- Les ingrédients dont la quantité NE BOUGE PAS avec la sortie réelle.
  -- Pour le tiramisu, c'est la mousse : une cuve entière, que la tournée
  -- sorte 128 ou 150 pièces. Tout le reste suit la nomenclature Odoo.
  figes    TEXT[] NOT NULL DEFAULT '{}',
  -- Comment le pâtissier appelle ce groupe figé : « La mousse ».
  figes_nom TEXT,

  actif    BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE fab_annexe_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fab_annexe_articles_all ON fab_annexe_articles;
CREATE POLICY fab_annexe_articles_all ON fab_annexe_articles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Premier article : le tiramisu individuel.
-- La « mousse » n'existe pas comme article chez Odoo : la nomenclature du
-- tiramisu porte directement ses 6 matières premières. Ce sont elles qu'on
-- fige. Le sucre y est cité DEUX FOIS (10 g + 3,86 g) et l'eau une fois : ces
-- deux dernières lignes sont la pâte à bombe — le sirop cuit qu'on verse sur
-- les jaunes. Elles font donc bien partie de la mousse (Layla, 2026-09-07).
-- ------------------------------------------------------------
INSERT INTO fab_annexe_articles (produit, libelle, photo, mini, maxi, tournee, figes, figes_nom)
VALUES (
  'SM- Tiramisu indiv',
  'Tiramisu individuel',
  'E- Tiramisu',
  70, 140, 140,
  ARRAY['MP- Mascarpone', 'MP- Crème whipping', 'MP- Oeufs jaune',
        'MP- Sucre Granule', 'MP- Gelatine en poudre', 'MP- Eau robinet'],
  'La mousse'
)
ON CONFLICT (produit) DO NOTHING;
