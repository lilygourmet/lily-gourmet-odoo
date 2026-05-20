-- ============================================================
-- LILY GOURMET — GESTION DE CAISSE — Setup complet
-- À exécuter dans Supabase SQL Editor (1 fois)
-- ============================================================

-- 1) Permissions sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_caisse BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_caisse_admin BOOLEAN DEFAULT false;

-- 2) Destinataires (éditables, avec couleur)
CREATE TABLE IF NOT EXISTS caisse_destinataires (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('caisse_geree', 'perso', 'banque')),
  color_key TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  position INT DEFAULT 0,
  linked_caisse_owner TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Enveloppes (1 enveloppe = 1 session POS fermée)
CREATE TABLE IF NOT EXISTS caisse_enveloppes (
  id BIGSERIAL PRIMARY KEY,
  odoo_session_id BIGINT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  session_date DATE NOT NULL,
  amount_cash NUMERIC(10,2) NOT NULL,
  destinataire_id BIGINT REFERENCES caisse_destinataires(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES profiles(id),
  proof_url TEXT,
  proof_date DATE,
  proof_uploaded_at TIMESTAMPTZ,
  salaire_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enveloppes_session_date ON caisse_enveloppes(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_enveloppes_destinataire ON caisse_enveloppes(destinataire_id);

-- 4) Mouvements des caisses-gérées (entrées + sorties)
CREATE TABLE IF NOT EXISTS caisse_mouvements (
  id BIGSERIAL PRIMARY KEY,
  caisse_owner TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('entree', 'sortie')),
  source_type TEXT NOT NULL,
  source_ref BIGINT,
  amount NUMERIC(10,2) NOT NULL,
  category TEXT,
  label TEXT NOT NULL,
  mvt_date DATE NOT NULL,
  has_facture BOOLEAN DEFAULT false,
  facture_status TEXT,
  facture_recovered_at TIMESTAMPTZ,
  month_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_mouvements_owner_date ON caisse_mouvements(caisse_owner, mvt_date DESC);
CREATE INDEX IF NOT EXISTS idx_mouvements_facture ON caisse_mouvements(facture_status) WHERE has_facture = true;

-- 5) Catégories par caisse
CREATE TABLE IF NOT EXISTS caisse_categories (
  id BIGSERIAL PRIMARY KEY,
  caisse_owner TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  position INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  UNIQUE(caisse_owner, name)
);

-- 6) Dépenses Hamid (sous-compte Meriem)
CREATE TABLE IF NOT EXISTS caisse_hamid_depenses (
  id BIGSERIAL PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL,
  category TEXT,
  label TEXT NOT NULL,
  depense_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_hamid_date ON caisse_hamid_depenses(depense_date DESC);

-- 7) Salaires
CREATE TABLE IF NOT EXISTS caisse_salaires (
  id BIGSERIAL PRIMARY KEY,
  beneficiaire TEXT NOT NULL CHECK (beneficiaire IN ('nezha', 'layla')),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL,
  target_amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'pret', 'paye')),
  reliquat_amount NUMERIC(10,2),
  reliquat_destination TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beneficiaire, month, year)
);

-- 8) Clôtures mensuelles caisses-gérées
CREATE TABLE IF NOT EXISTS caisse_cloture_mois (
  id BIGSERIAL PRIMARY KEY,
  caisse_owner TEXT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL,
  closing_balance NUMERIC(10,2) NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by UUID REFERENCES profiles(id),
  UNIQUE(caisse_owner, month, year)
);

-- 9) Sessions POS Odoo (config auto-détectée)
CREATE TABLE IF NOT EXISTS caisse_pos_sessions_config (
  id BIGSERIAL PRIMARY KEY,
  pos_config_id BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_session_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10) Salaires par défaut
CREATE TABLE IF NOT EXISTS caisse_salaires_defaut (
  beneficiaire TEXT PRIMARY KEY CHECK (beneficiaire IN ('nezha', 'layla')),
  amount NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- RLS — Permissif pour authenticated (v1)
-- ============================================================
ALTER TABLE caisse_destinataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_enveloppes ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_hamid_depenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_salaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_cloture_mois ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_pos_sessions_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_salaires_defaut ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auth all caisse_destinataires" ON caisse_destinataires FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_enveloppes" ON caisse_enveloppes FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_mouvements" ON caisse_mouvements FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_categories" ON caisse_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_hamid_depenses" ON caisse_hamid_depenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_salaires" ON caisse_salaires FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_cloture_mois" ON caisse_cloture_mois FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_pos_sessions_config" ON caisse_pos_sessions_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth all caisse_salaires_defaut" ON caisse_salaires_defaut FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BUCKET STORAGE pour les preuves
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('caisse-preuves', 'caisse-preuves', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "auth upload caisse-preuves" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'caisse-preuves');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read caisse-preuves" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'caisse-preuves');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth update caisse-preuves" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'caisse-preuves');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth delete caisse-preuves" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'caisse-preuves');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

-- Destinataires
INSERT INTO caisse_destinataires (name, type, color_key, position, linked_caisse_owner) VALUES
  ('Meriem', 'caisse_geree', 'vert_clair', 10, 'meriem'),
  ('Layla LG', 'caisse_geree', 'vert_teal', 20, 'layla_lg'),
  ('Nezha perso', 'perso', 'orange', 30, NULL),
  ('Layla perso', 'perso', 'corail', 40, NULL),
  ('Banque', 'banque', 'bleu', 50, NULL)
ON CONFLICT DO NOTHING;

-- Catégories Caisse Meriem
INSERT INTO caisse_categories (caisse_owner, name, emoji, position) VALUES
  ('meriem', 'Supermarché / courses', '🛒', 10),
  ('meriem', 'Livraison / coursier', '🚖', 20),
  ('meriem', 'Achats étranger', '🌍', 30),
  ('meriem', 'Matériel / équipement', '🔧', 40),
  ('meriem', 'Réparation', '🛠️', 50),
  ('meriem', 'Avance Hamid', '🚖', 60),
  ('meriem', 'Avance employé', '💼', 70),
  ('meriem', 'Pourboire', '💰', 80),
  ('meriem', 'Autre', '❓', 90)
ON CONFLICT DO NOTHING;

-- Catégories Caisse Layla LG
INSERT INTO caisse_categories (caisse_owner, name, emoji, position) VALUES
  ('layla_lg', 'Facture / charges', '💧', 10),
  ('layla_lg', 'Comptable', '💼', 20),
  ('layla_lg', 'Banque / commission', '🏦', 30),
  ('layla_lg', 'Autre', '❓', 90)
ON CONFLICT DO NOTHING;

-- Salaires par défaut
INSERT INTO caisse_salaires_defaut (beneficiaire, amount) VALUES
  ('nezha', 8000),
  ('layla', 8000)
ON CONFLICT (beneficiaire) DO NOTHING;

-- ============================================================
-- FIN
-- ============================================================
