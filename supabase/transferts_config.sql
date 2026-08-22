-- ============================================================
-- LILY GOURMET — Réglages des transferts (numéros WhatsApp prévenus)
--
-- Table à part : « app_config » garde le code d'accès Caisse/RH et doit rester
-- fermée en écriture depuis l'app — d'où l'erreur « row-level security policy »
-- en voulant y enregistrer les numéros.
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS transferts_config (
  key        TEXT PRIMARY KEY,     -- 'wa_boutique' | 'wa_annexe'
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transferts_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all transferts_config" ON transferts_config
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reprise des numéros déjà saisis dans app_config, s'il y en a.
INSERT INTO transferts_config (key, value)
SELECT REPLACE(key, 'transfert_', ''), value FROM app_config WHERE key LIKE 'transfert_wa_%'
ON CONFLICT (key) DO NOTHING;

INSERT INTO transferts_config (key, value) VALUES ('wa_boutique', ''), ('wa_annexe', '')
ON CONFLICT (key) DO NOTHING;
