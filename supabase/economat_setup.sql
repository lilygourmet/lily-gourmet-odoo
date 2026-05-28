-- ============================================================
-- LILY GOURMET — ÉCONOMAT (demandes d'articles) — Schéma + RLS
-- À exécuter dans Supabase SQL Editor (1 fois), AVANT economat_seed.sql
-- ============================================================

-- 1) Permissions / profil sur profiles
--    economat_profil : profil métier qui ouvre une ou plusieurs catégories
--      ('prod_annex' | 'prod_finition_cd' | 'cake_design' | 'boutique'
--       | 'chocolat_cuisine_menage' | NULL = pas d'accès)
--    perm_econome    : reçoit les demandes (le magasinier / l'économe)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS economat_profil TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_econome BOOLEAN DEFAULT false;

-- 2) Catégories (= les 4 onglets de l'Excel)
CREATE TABLE IF NOT EXISTS economat_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true
);

-- 3) Groupes (appartiennent à une catégorie ; ex : Emballages, Chocolats & Cacaos)
CREATE TABLE IF NOT EXISTS economat_groups (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES economat_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  UNIQUE(category_id, name)
);

-- 4) Articles (1 ligne par ligne de l'Excel)
--    photo_url + odoo_product_id + odoo_name : laissés vides (remplis à l'étape 3, depuis Odoo)
CREATE TABLE IF NOT EXISTS economat_articles (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES economat_categories(id) ON DELETE CASCADE,
  group_id BIGINT REFERENCES economat_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT,
  photo_url TEXT,
  odoo_product_id BIGINT,
  odoo_name TEXT,
  active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_economat_articles_cat ON economat_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_economat_articles_group ON economat_articles(group_id);

-- 5) Mapping profil -> catégories (seedé dans economat_seed.sql)
CREATE TABLE IF NOT EXISTS economat_profil_categories (
  profil TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES economat_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (profil, category_id)
);

-- 6) Demandes envoyées (utilisé à l'étape 2 : envoi vers l'économe)
CREATE TABLE IF NOT EXISTS economat_demandes (
  id BIGSERIAL PRIMARY KEY,
  requester_user_id UUID REFERENCES profiles(id),
  category_id BIGINT REFERENCES economat_categories(id) ON DELETE SET NULL,
  task_id BIGINT,
  status TEXT DEFAULT 'envoyee',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_economat_demandes_user ON economat_demandes(requester_user_id, created_at DESC);

-- 7) Lignes d'une demande (article + quantité, avec snapshot nom/unité)
CREATE TABLE IF NOT EXISTS economat_demande_lignes (
  id BIGSERIAL PRIMARY KEY,
  demande_id BIGINT NOT NULL REFERENCES economat_demandes(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES economat_articles(id) ON DELETE SET NULL,
  article_name TEXT,
  unit TEXT,
  qty NUMERIC(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_economat_demande_lignes_dem ON economat_demande_lignes(demande_id);

-- ============================================================
-- RLS — Permissif anon + authenticated (comme le reste de l'app)
-- ============================================================
ALTER TABLE economat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_profil_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE economat_demande_lignes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "all economat_categories" ON economat_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all economat_groups" ON economat_groups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all economat_articles" ON economat_articles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all economat_profil_categories" ON economat_profil_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all economat_demandes" ON economat_demandes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all economat_demande_lignes" ON economat_demande_lignes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- FIN — lancer ensuite economat_seed.sql pour remplir les données
-- ============================================================
