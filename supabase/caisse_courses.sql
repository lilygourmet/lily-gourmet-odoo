-- ============================================================
-- LILY GOURMET - Caisse : Courses confiees a des "pions" (occasionnels)
-- Meriem donne de l'argent a une personne (nom libre) pour faire des courses,
-- puis solde avec le detail (plusieurs lignes categorisees) + le rendu.
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

-- 1. L'avance pour courses (le "don")
CREATE TABLE IF NOT EXISTS caisse_courses (
  id                  BIGSERIAL PRIMARY KEY,
  person              TEXT NOT NULL,                 -- nom libre, pas de personnage cree
  amount_given        NUMERIC(10,2) NOT NULL,
  given_date          DATE NOT NULL,
  status              TEXT DEFAULT 'en_cours' CHECK (status IN ('en_cours','regle')),
  settled_at          TIMESTAMPTZ,
  sortie_mouvement_id BIGINT,                        -- mouvement caisse Meriem (sortie au don)
  entree_mouvement_id BIGINT,                        -- mouvement caisse Meriem (entree au rendu)
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_status ON caisse_courses(status, given_date DESC);

-- 2. Le detail des depenses d'une course (1 ligne = 1 categorie)
CREATE TABLE IF NOT EXISTS caisse_courses_depenses (
  id          BIGSERIAL PRIMARY KEY,
  course_id   BIGINT NOT NULL REFERENCES caisse_courses(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL,
  category    TEXT,
  label       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_courses_dep_course ON caisse_courses_depenses(course_id);

ALTER TABLE caisse_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_courses_depenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all caisse_courses" ON caisse_courses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all caisse_courses_depenses" ON caisse_courses_depenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
