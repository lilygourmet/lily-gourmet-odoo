-- Absences « classées sans suite » dans l'onglet RH « À traiter ».
-- Permet de retirer une absence de la liste SANS créer de congé ni toucher au
-- pointage, avec une raison :
--   'ancien_jour_off'  → l'employé a changé de jour off (ce n'était pas un vrai jour travaillé)
--   'deja_traite'      → déjà couvert par un autre congé
-- NB : employe_id en BIGINT (employes.id) ; date_jour (pas 'date', convention projet).
CREATE TABLE IF NOT EXISTS rh_absences_ignorees (
  id          BIGSERIAL PRIMARY KEY,
  employe_id  BIGINT NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  date_jour   DATE NOT NULL,
  raison      TEXT NOT NULL,           -- 'ancien_jour_off' | 'deja_traite'
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employe_id, date_jour)
);

CREATE INDEX IF NOT EXISTS idx_rh_absences_ignorees_emp_date ON rh_absences_ignorees(employe_id, date_jour);

ALTER TABLE rh_absences_ignorees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all rh_absences_ignorees" ON rh_absences_ignorees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
