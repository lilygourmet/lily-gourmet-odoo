-- ============================================================
-- LILY GOURMET — Les 2 matières de l'ancienne liste « Transferts MP » qui
-- n'apparaissaient pas dans l'analyse Odoo (jamais transférées ces 5 mois).
-- On les ajoute pour que la liste reste complète.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

INSERT INTO transferts_articles (odoo_product_id, nom, unite, famille, nb_transferts) VALUES
  (6152, 'MP- Pectine NH', 'kg', 'mp', 0),
  (5967, 'FS- Pecan',      'kg', 'mp', 0)
ON CONFLICT (odoo_product_id) DO UPDATE SET famille = EXCLUDED.famille, actif = true;
