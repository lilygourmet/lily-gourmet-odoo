-- ============================================================
-- LILY GOURMET - Groupes d'employés gérables (ajouter/renommer/supprimer)
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS employe_groupes (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL UNIQUE,
  sort       INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employe_groupes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employe_groupes_all ON employe_groupes;
CREATE POLICY employe_groupes_all ON employe_groupes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Groupes de départ (la liste actuelle)
INSERT INTO employe_groupes (nom, sort) VALUES
  ('Pâtisserie', 0),
  ('Café / Boutique', 1),
  ('Caisse', 2),
  ('Commercial / WhatsApp', 3),
  ('Livreur', 4),
  ('Production', 5),
  ('RH / Admin', 6),
  ('Aucun', 7)
ON CONFLICT (nom) DO NOTHING;
