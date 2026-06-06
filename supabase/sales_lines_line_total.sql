-- Prix TTC par ligne de commande (pour afficher le prix du cake design CD- dans le modal).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- Se remplit à la prochaine synchro Odoo (cron) après ajout de la colonne.
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC;
