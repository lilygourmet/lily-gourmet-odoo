-- ============================================================
-- « Fabrication Annexe 2 » : les articles qu'on ACHÈTE, même si Odoo leur
-- connaît une nomenclature.
--
-- La framboise congelée a une recette dans Odoo (on congèle du frais), donc
-- l'app la croyait fabriquée à l'annexe : elle bloquait le confit, avec un
-- stock à −1 981 g et aucun moyen d'en sortir. Layla : « c'est un achat ».
--
-- Un article marqué ici ne bloque jamais et l'écran ne descend pas dedans.
-- À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

ALTER TABLE fab_annexe_articles
  ADD COLUMN IF NOT EXISTS achete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN fab_annexe_articles.achete IS
  'true = on l''achète, on ne le fabrique pas — même si Odoo lui connaît une recette.';

INSERT INTO fab_annexe_articles (produit, libelle, mini, maxi, tournee, actif, achete)
VALUES ('F- Framboise Congelée', 'Framboise congelée', 0, 0, 0, false, true)
ON CONFLICT (produit) DO UPDATE SET achete = true;
