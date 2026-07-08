-- ============================================================
-- LILY GOURMET - Supports : règles de détection auto
-- Une règle = mot-clé (dans le nom d'un article) → support + quantité.
-- qty_mode : 'line_qty' = quantité de l'article ; 'fixed' = nombre fixe par article.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================
CREATE TABLE IF NOT EXISTS support_rules (
  id         BIGSERIAL PRIMARY KEY,
  support_id BIGINT NOT NULL REFERENCES supports(id) ON DELETE CASCADE,
  keyword    TEXT NOT NULL,                    -- mot-clé cherché dans le nom de l'article
  qty_mode   TEXT NOT NULL DEFAULT 'line_qty', -- 'line_qty' | 'fixed'
  qty_value  INTEGER NOT NULL DEFAULT 1,       -- multiplicateur (line_qty) ou nombre fixe
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_rules_support ON support_rules(support_id);
ALTER TABLE support_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all support_rules" ON support_rules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
