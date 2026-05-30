-- ============================================================
-- Sessions de dépense Hamid : une saisie groupée (N lignes) + UNE preuve.
-- Une « session » = quand Hamid revient avec ses tickets, Meriem saisit
-- plusieurs lignes d'un coup et joint une photo de preuve commune.
-- À exécuter AVANT le déploiement du code qui lit ces colonnes.
-- ============================================================

CREATE TABLE IF NOT EXISTS caisse_hamid_sessions (
  id                BIGSERIAL PRIMARY KEY,
  session_date      DATE NOT NULL,
  user_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  proof_url         TEXT,
  proof_uploaded_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Lien d'une dépense vers sa session (nullable : les dépenses créées avant
-- l'introduction des sessions restent valides sans session).
ALTER TABLE caisse_hamid_depenses
  ADD COLUMN IF NOT EXISTS hamid_session_id BIGINT
    REFERENCES caisse_hamid_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS caisse_hamid_depenses_session_idx
  ON caisse_hamid_depenses(hamid_session_id);

-- RLS : on autorise lecture/écriture à anon + authenticated (cohérent avec
-- le reste du module Caisse).
ALTER TABLE caisse_hamid_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS caisse_hamid_sessions_all
  ON caisse_hamid_sessions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
