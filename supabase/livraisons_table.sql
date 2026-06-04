-- Table d'assignation des livraisons par NUMÉRO de commande (Sxxxx).
-- (Remplace orders.livreur_id : certaines livraisons n'ont pas d'order_id interne,
--  mais toutes ont un n° S.)

CREATE TABLE IF NOT EXISTS livraisons (
  order_num       TEXT PRIMARY KEY,
  livreur_id      UUID REFERENCES profiles(id),
  livraison_faite BOOLEAN DEFAULT false,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE livraisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS livraisons_all ON livraisons;
CREATE POLICY livraisons_all ON livraisons
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
