-- ============================================================
-- « Fabrication CD » : quand on coche une préparation (une crème par exemple),
-- on retient MAINTENANT les ordres de fabrication Odoo qu'elle couvre — ceux
-- des gâteaux en cours. Sans ça, la page « À valider » allait chercher
-- n'importe quel ordre ouvert du même article, y compris ceux prévus des
-- semaines plus tard (cas vécu : 2,72 kg de crème praliné faits, deux ordres
-- de septembre proposés à la validation).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE prod_of_faits
  ADD COLUMN IF NOT EXISTS ordres TEXT[];
