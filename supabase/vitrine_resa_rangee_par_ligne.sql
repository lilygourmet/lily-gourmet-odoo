-- Réservation vitrine : suivi du « rangé » PAR ARTICLE (ligne) au lieu de par commande.
-- Chaque ligne de la commande (ex. Black Forest, Framboisier) se range séparément.
ALTER TABLE vitrine_resa_rangee ADD COLUMN IF NOT EXISTS line_id BIGINT;
ALTER TABLE vitrine_resa_rangee ADD COLUMN IF NOT EXISTS product_name TEXT;

-- On remplace l'unicité (day, order_id) par (day, line_id) pour autoriser
-- plusieurs lignes d'une même commande.
DO $$ BEGIN
  ALTER TABLE vitrine_resa_rangee DROP CONSTRAINT vitrine_resa_rangee_day_order_id_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vitrine_resa_rangee_day_line ON vitrine_resa_rangee(day, line_id);
