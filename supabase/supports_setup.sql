-- ============================================================
-- LILY GOURMET - Supports (consignes : verrines, plateaux, présentoirs…)
-- Suivi du stock + sorties (OCP / client) + retours.
-- Table + bucket photo public 'supports' + permission perm_supports.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

-- 0. Permission d'accès à l'onglet
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_supports BOOLEAN DEFAULT false;

-- 1. Types de supports (1 ligne = 1 type, ex. « Verrines rondes »)
CREATE TABLE IF NOT EXISTS supports (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  photo_url  TEXT,                       -- URL publique de la photo (bucket 'supports')
  total_qty  INTEGER NOT NULL DEFAULT 0, -- combien on en possède au total
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE supports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all supports" ON supports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Sorties (prêts). Une sortie « ouverte » = qty_returned < qty (pas encore tout rendu)
CREATE TABLE IF NOT EXISTS support_sorties (
  id           BIGSERIAL PRIMARY KEY,
  support_id   BIGINT NOT NULL REFERENCES supports(id) ON DELETE CASCADE,
  qty          INTEGER NOT NULL,             -- quantité sortie
  qty_returned INTEGER NOT NULL DEFAULT 0,   -- quantité déjà rendue
  dest_type    TEXT NOT NULL DEFAULT 'client', -- 'ocp' | 'client'
  client_name  TEXT,                          -- nom du client (si dest_type='client')
  order_num    TEXT,                          -- n° commande (S…)
  note         TEXT,
  date_sortie  DATE NOT NULL DEFAULT CURRENT_DATE,
  returned_at  TIMESTAMPTZ,                   -- rempli quand TOUT est rendu
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_sorties_support ON support_sorties(support_id);
CREATE INDEX IF NOT EXISTS idx_support_sorties_open ON support_sorties(returned_at);
ALTER TABLE support_sorties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all support_sorties" ON support_sorties FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Bucket photo PUBLIC (les photos de supports ne sont pas sensibles)
INSERT INTO storage.buckets (id, name, public)
VALUES ('supports', 'supports', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "supports photo insert" ON storage.objects
    FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'supports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "supports photo select" ON storage.objects
    FOR SELECT TO anon, authenticated USING (bucket_id = 'supports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "supports photo delete" ON storage.objects
    FOR DELETE TO anon, authenticated USING (bucket_id = 'supports');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
