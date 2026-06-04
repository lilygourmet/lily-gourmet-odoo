-- Table d'assignation des livraisons par NUMÉRO de commande (Sxxxx).
-- (Remplace orders.livreur_id : certaines livraisons n'ont pas d'order_id interne,
--  mais toutes ont un n° S.)

CREATE TABLE IF NOT EXISTS livraisons (
  order_num       TEXT PRIMARY KEY,
  livreur_id      UUID REFERENCES profiles(id),
  livraison_faite BOOLEAN DEFAULT false,
  statut          TEXT DEFAULT 'assignee',   -- 'assignee' | 'acceptee' | 'refusee'
  assigned_by     UUID REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Si la table existait déjà sans ces colonnes :
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'assignee';
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES profiles(id);

ALTER TABLE livraisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS livraisons_all ON livraisons;
CREATE POLICY livraisons_all ON livraisons
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
