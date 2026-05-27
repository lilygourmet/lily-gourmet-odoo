-- ============================================================
-- LILY GOURMET - Lot d'ameliorations (revue des onglets 2026-05-27)
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

-- Vague 2 ----------------------------------------------------
-- #4 Note interne (privee, visible equipe) sur une conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- #3 Date d'echeance sur une tache
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;

-- Vague 4 ----------------------------------------------------
-- #2 Journal d'activite Caisse : table deja utilisee par le code
-- (logAction / loadAuditLog / AuditLogPanel) mais jamais creee en base.
CREATE TABLE IF NOT EXISTS caisse_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  action       TEXT NOT NULL,
  description  TEXT,
  amount       NUMERIC(10,2),
  before_value JSONB,
  after_value  JSONB,
  actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caisse_audit_entity ON caisse_audit_log(entity_type, entity_id, created_at DESC);

ALTER TABLE caisse_audit_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all caisse_audit_log" ON caisse_audit_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
