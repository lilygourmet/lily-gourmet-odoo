-- ============================================================
-- « Pour quel gâteau ? » — réserver une préparation à celui qui l'a demandée.
--
-- POURQUOI : quand on ouvre la Ganache Gold depuis la Base CBS 23 cm et qu'on
-- la fait, elle est POUR le 23 cm. Sans cette colonne, la Base CBS 18 cm
-- voyait cette ganache comme disponible et ne demandait plus rien — deux
-- gâteaux, une seule ganache, et il en manquait au montage.
-- (Règle de Layla, 2026-09-10.)
--
-- L'app fonctionne SANS cette colonne : elle réessaie sans elle et perd
-- seulement le lien. La lancer active la réservation.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE prod_fabrications
  ADD COLUMN IF NOT EXISTS pour text;

COMMENT ON COLUMN prod_fabrications.pour IS
  'Le gâteau pour lequel cette fournée a été faite (nom Odoo de l''article de tête). Vide = disponible pour tous.';

-- ------------------------------------------------------------
-- Vérification : la colonne est là, et vide pour l'existant.
-- ------------------------------------------------------------
SELECT count(*) AS lignes, count(pour) AS avec_lien
  FROM prod_fabrications
 WHERE atelier = 'annexe';
