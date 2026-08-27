-- ============================================================
-- Onglet « Fabrication Prod » : ce que l'équipe a fabriqué dans la journée.
-- Simple trace dans l'app — Odoo n'est pas touché.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_fabrication_prod BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS prod_fabrications (
  id BIGSERIAL PRIMARY KEY,
  jour DATE NOT NULL,
  article TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  fait_par UUID REFERENCES profiles(id),
  fait_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- une seule déclaration par article et par jour : on la corrige, on n'empile pas
  UNIQUE (jour, article)
);

CREATE INDEX IF NOT EXISTS prod_fabrications_jour_idx ON prod_fabrications (jour DESC);

ALTER TABLE prod_fabrications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prod_fabrications_all ON prod_fabrications;
CREATE POLICY prod_fabrications_all ON prod_fabrications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Les articles ajoutés à la main depuis l'onglet (bouton « Autre article »).
-- La photo est gardée telle quelle dans la ligne (image réduite à 700 px) :
-- pour quelques articles c'est plus simple qu'un bucket à configurer.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prod_articles (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  unite TEXT NOT NULL DEFAULT 'g',
  photo TEXT,
  cree_par UUID REFERENCES profiles(id),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE prod_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prod_articles_all ON prod_articles;
CREATE POLICY prod_articles_all ON prod_articles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
