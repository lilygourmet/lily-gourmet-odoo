-- ============================================================
-- LES VRACS QUI DOIVENT ÊTRE MIS EN FORME.
--
-- « Quand une mousse, crème, chantilly, crémeux se fait, j'ai besoin que ça
-- parte dans À déclarer leur découpe » (Layla, 2026-09-20) : la chantilly est
-- PIPÉE, le crémeux COULÉ dans les moules, le voile DÉCOUPÉ. Une préparation
-- n'est pas finie quand elle sort de la cuve.
--
-- ⚠️ UNE TABLE À PART, ET PAS UNE COLONNE DU CATALOGUE. J'ai d'abord voulu
-- poser une case sur `fab_annexe_articles` : vérification faite avant de
-- lancer quoi que ce soit, 5 des 21 vracs seulement y figurent. Cette
-- table-là ne tient que les articles à mini/maxi ; les 272 articles de l'écran
-- « Déclarer », eux, viennent d'Odoo. La liste vit donc seule.
--
-- ⚠️ ELLE VIT EN BASE, PAS DANS LE CODE : un article renommé chez Odoo casserait
-- une liste écrite en dur — c'est déjà arrivé (voir [renommage-odoo-casse-les-
-- liens]). Ici, une ligne se corrige sans toucher au code.
--
-- ⚠️ ON NE DEVINE PAS LA LISTE. J'avais voulu la déduire du nom (« SM. » serait
-- une préparation, « SM- » un gâteau) : faux. Ses bases s'appellent
-- « SM. Base CBS 23 cm » ET « SM- Base Tarte CBS 18 cm » — la même chose, deux
-- écritures. Le préfixe ne dit rien ; seule sa liste fait foi.
--
-- CE QU'ELLE A ÉCARTÉ, et pourquoi :
--   • les PLAQUES (brownie, gianduja, amande gingembre) : elles ont déjà leur
--     découpe dans l'écran (« combien de plaques cuites »), inutile de doubler ;
--   • Masse Gélatine, Beurre Clarifié : des ingrédients, pas des moulages ;
--   • Pâte à croissant, Sablé Crispy, Ghriba, Biscuit café, Biscuit cannelle,
--     Pâte Sablé (Tarte), pâte vanille maison : « pas pour le moment ».
--
-- À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS annexe_mise_en_forme (
  produit TEXT PRIMARY KEY,
  actif   BOOLEAN NOT NULL DEFAULT true,
  note    TEXT
);

COMMENT ON TABLE annexe_mise_en_forme IS
  'Les vracs qui doivent être mis en forme (coulés, pipés, moulés) avant d''être finis. Déclarer le vrac réclame alors sa mise en forme.';

ALTER TABLE annexe_mise_en_forme ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS annexe_mise_en_forme_lecture ON annexe_mise_en_forme;
CREATE POLICY annexe_mise_en_forme_lecture ON annexe_mise_en_forme
  FOR SELECT TO authenticated USING (true);

-- Les 21 vracs retenus avec Layla le 2026-09-20.
--
-- ⚠️ « Subleme », pas « Sublime » : c'est écrit comme ça chez Odoo, et la liste
-- doit coller au nom EXACT, sinon la ligne ne rattrape jamais son article.
INSERT INTO annexe_mise_en_forme (produit, note) VALUES
  ('SM. Crémeux Pistache',                 'coulé en moules — 10 pers, indiv'),
  ('SM. Mousse Meringue Citron (kg)',      'coulée — indiv (le 10 pers est inactif chez Odoo)'),
  ('SM. Gélée Mangue Ananas Pistache',     'coulée — 10 pers, indiv'),
  ('SM. Confit de Framboise Prod',         'coulé — fonds citron framboise (1), (5), (10)'),
  ('SM. Creme Amande',                     'garnit les fonds de tarte nature'),
  ('SM. Crunchy Pistache',                 'moulé — 10 pers, indiv'),
  ('SM. Crunchy Citron Passion',           'moulé — 10 pers, 5 pers, indiv'),
  ('SM. Crunchy Gianduja',                 'moulé — 10 pers, indiv'),
  ('SM. Fond de tarte digestif',           'foncé — 23 cm, 18 cm'),
  ('SM. Caramel Beurre Sale Production',   'coulé — bases CBS 23, 18, indiv'),
  ('SM. Ganache Gold',                     'coulée — bases CBS 23, 18, indiv'),
  ('SM. Pate Sable Cacao (Tarte)',         'foncée — mini fonds de tarte cacao'),
  ('SM. Ganache Chocolat Brioche / Tarte', 'coulée — mini fonds de tarte cacao'),
  ('SM. Pate a Choux au kg',               'dressée — paris-brest, choux'),
  ('SM CD*. Creme Citron',                 'cake design'),
  ('SM CD*. Creme au Beurre Praline',      'cake design'),
  ('SM. Genoise Chocolat KG CD',           'cake design'),
  ('SM. Fourrage Nougat CD',               'cake design'),
  ('SM. Subleme Fromage Passion',          'coulé — cheesecake exotique 10 pers, indiv'),
  ('SM. Ganache Montée Sapin',             'pipée — tarte CBS 23 cm, 18 cm, indiv'),
  ('SM. Subleme Fleur d''Oranger Pistache', 'coulé — pistache fleur d''oranger 10 pers, indiv')
ON CONFLICT (produit) DO UPDATE SET actif = true, note = EXCLUDED.note;

-- Ce qui est coché, pour vérifier d'un coup d'œil après le passage.
SELECT produit, note FROM annexe_mise_en_forme WHERE actif ORDER BY produit;
