-- ============================================================
-- « Recette vérifiée et validée par le chef : ça sort de la liste et va dans
--   le sous-onglet Validés. Donc onglet À vérifier et onglet Validés. »
--   (Layla, 2026-09-23)
--
-- Une seule ligne par recette validée. Pas de ligne = elle reste à vérifier.
-- Dévalider, c'est effacer la ligne : le travail du chef est un ÉTAT, pas un
-- journal — on ne garde pas l'historique de ses allers-retours.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS recettes_validees (
  -- Le nom EXACT de l'article dans Odoo, comme partout ailleurs.
  produit    TEXT PRIMARY KEY,
  valide_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Qui a validé : l'app écrit l'id du profil. Jamais obligatoire — une
  -- validation sans nom vaut mieux qu'une validation perdue.
  valide_par UUID
);

ALTER TABLE recettes_validees ENABLE ROW LEVEL SECURITY;

-- ⚠️ LECTURE SEULE POUR LES NAVIGATEURS. L'écriture passe par l'API, qui
-- vérifie la session — même règle que `annexe_mise_en_forme` depuis la faille
-- anon fermée le 2026-06-05.
DROP POLICY IF EXISTS recettes_validees_lire ON recettes_validees;
CREATE POLICY recettes_validees_lire ON recettes_validees
  FOR SELECT TO authenticated USING (true);

-- Ce qui est validé, pour vérifier d'un coup d'œil après le passage.
SELECT produit, valide_le FROM recettes_validees ORDER BY valide_le DESC;
