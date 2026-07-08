-- Favoris de dépense gérés par le livreur (Hamid) lui-même.
-- Chaque favori = un raccourci (libellé + catégorie + photo obligatoire ou non).
CREATE TABLE IF NOT EXISTS caisse_livreur_favoris (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text NOT NULL,
  category    text,
  needs_proof boolean NOT NULL DEFAULT true,   -- false = pas de photo (ex: pourboire)
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE caisse_livreur_favoris ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_livreur_favoris" ON caisse_livreur_favoris FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
