-- ============================================================
-- ÉCONOMAT — un article peut venir de l'Odoo LG traiteur
--
-- odoo_source          : NULL/'principal' = Odoo Lily Gourmet, 'lgt' = LG traiteur
-- fournisseur_odoo_id  : chez LG traiteur, l'achat part chez un fournisseur précis
-- fournisseur_nom      : le nom, pour l'afficher sans réinterroger Odoo
--
-- À LANCER AVANT le SQL des 99 articles LG traiteur.
-- ============================================================

ALTER TABLE economat_articles ADD COLUMN IF NOT EXISTS odoo_source         TEXT;
ALTER TABLE economat_articles ADD COLUMN IF NOT EXISTS fournisseur_odoo_id BIGINT;
ALTER TABLE economat_articles ADD COLUMN IF NOT EXISTS fournisseur_nom     TEXT;

-- Les articles existants viennent tous de l'Odoo principal.
UPDATE economat_articles SET odoo_source = 'principal' WHERE odoo_source IS NULL;
