-- Étiquettes de conversation gérables par l'admin (ajouter / renommer / couleur / supprimer)
CREATE TABLE IF NOT EXISTS conversation_labels (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#993556',
  bg    TEXT NOT NULL DEFAULT '#F7E3EA',
  sort  INT  DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_labels_all ON conversation_labels;
CREATE POLICY conversation_labels_all ON conversation_labels
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Étiquettes de départ (les 3 actuelles)
INSERT INTO conversation_labels (key, label, color, bg, sort) VALUES
  ('a_relancer',   'À relancer',   '#E08A00', '#FFF3D6', 0),
  ('devis_envoye', 'Devis envoyé', '#1456a0', '#E6F1FB', 1),
  ('a_encaisser',  'À encaisser',  '#A32D2D', '#FBD9D0', 2)
ON CONFLICT (key) DO NOTHING;
