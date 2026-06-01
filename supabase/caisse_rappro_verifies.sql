-- Rapprochement bancaire : mémorise les suspects déjà vérifiés / justifiés
-- (pour ne plus les resignaler quand on recharge le relevé).
-- txn_key = identifiant stable d'une ligne du relevé : date|heure|montant|STAN.

CREATE TABLE IF NOT EXISTS caisse_rappro_verifies (
  txn_key     TEXT PRIMARY KEY,
  amount      NUMERIC(10,2),
  txn_date    DATE,
  note        TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE caisse_rappro_verifies ENABLE ROW LEVEL SECURITY;

-- L'app utilise une auth maison (connexion en rôle « anon ») → autoriser anon + authenticated.
DROP POLICY IF EXISTS "auth all caisse_rappro_verifies" ON caisse_rappro_verifies;
DROP POLICY IF EXISTS "all caisse_rappro_verifies" ON caisse_rappro_verifies;
CREATE POLICY "all caisse_rappro_verifies" ON caisse_rappro_verifies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
