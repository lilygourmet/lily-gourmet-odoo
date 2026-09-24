-- ============================================================
-- CE QUE LE CHEF A RELU — trois états, pas deux.
--
-- « Recette vérifiée et validée par le chef : ça sort de la liste et va dans le
--   sous-onglet Validés. Donc onglet À vérifier et onglet Validés. »
-- « Dans Recettes, cocher les recettes à problème aussi, et les mettre dans
--   Non validé. » (Layla, 2026-09-23)
--
--   pas de ligne  → À vérifier   (personne ne l'a encore regardée)
--   'valide'      → Validés      (relue, elle est bonne)
--   'probleme'    → Non validés  (relue, il y a quelque chose à corriger)
--
-- Une seule ligne par recette : c'est un ÉTAT, pas un journal. Revenir à
-- « à vérifier », c'est effacer la ligne — on ne garde pas l'historique des
-- allers-retours du chef.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS recettes_validees (
  -- Le nom EXACT de l'article dans Odoo, comme partout ailleurs.
  produit    TEXT PRIMARY KEY,
  -- 'valide' ou 'probleme'.
  statut     TEXT NOT NULL DEFAULT 'valide',
  valide_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Qui a relu : l'app écrit l'id du profil. Jamais obligatoire — une marque
  -- sans nom vaut mieux qu'une marque perdue.
  valide_par UUID
);

-- Pour une base créée avant l'ajout du troisième état.
ALTER TABLE recettes_validees
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'valide';

-- Deux valeurs, pas trois : une faute de frappe ferait disparaître la recette
-- des trois onglets à la fois.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recettes_validees_statut_ok') THEN
    ALTER TABLE recettes_validees
      ADD CONSTRAINT recettes_validees_statut_ok CHECK (statut IN ('valide', 'probleme'));
  END IF;
END $$;

ALTER TABLE recettes_validees ENABLE ROW LEVEL SECURITY;

-- ⚠️ LECTURE SEULE POUR LES NAVIGATEURS. L'écriture passe par l'API, qui
-- vérifie la session — même règle que `annexe_mise_en_forme` depuis la faille
-- anon fermée le 2026-06-05.
DROP POLICY IF EXISTS recettes_validees_lire ON recettes_validees;
CREATE POLICY recettes_validees_lire ON recettes_validees
  FOR SELECT TO authenticated USING (true);

-- Où en est la relecture, pour vérifier d'un coup d'œil après le passage.
SELECT statut, count(*) FROM recettes_validees GROUP BY statut ORDER BY statut;
