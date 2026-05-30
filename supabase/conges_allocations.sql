-- ============================================================
-- Allocations de jours de congés / maladie / événements familiaux.
-- Chaque ligne = X jours de type Y attribués à un employé pour une année.
-- Sources possibles :
--   * 'auto'   : généré par l'app (annuel = 18 + ancienneté ; maladie_courte = 6)
--   * 'manuel' : saisi par RH (mariage, décès, naissance, circoncision, reliquat N-1…)
--   * 'odoo'   : importé depuis Odoo
-- À exécuter AVANT le déploiement du code qui lit cette table.
-- ============================================================

CREATE TABLE IF NOT EXISTS conges_allocations (
  id           BIGSERIAL PRIMARY KEY,
  employe_id   BIGINT NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  annee        INT NOT NULL,
  type         TEXT NOT NULL,
  -- Types attendus :
  --   'annuel'         : quota annuel (18 j + 1.5 à 5/10 ans)
  --   'maladie_courte' : 6 j/an avec cert pour absences ≤ 3 j (payés)
  --   'reliquat'       : report N-1 (expire le 30 mai)
  --   'mariage', 'naissance', 'deces', 'circoncision', 'autre'
  jours        NUMERIC(5,2) NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manuel',
  raison       TEXT,
  date_evt     DATE,
  statut       TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide', 'annule')),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conges_alloc_emp_idx   ON conges_allocations(employe_id);
CREATE INDEX IF NOT EXISTS conges_alloc_annee_idx ON conges_allocations(annee);
CREATE INDEX IF NOT EXISTS conges_alloc_type_idx  ON conges_allocations(type);
CREATE INDEX IF NOT EXISTS conges_alloc_statut_idx ON conges_allocations(statut);

-- Empêche les doublons d'allocations auto pour un (employé, type, année).
-- Les allocations manuelles peuvent être multiples par contre (chaque
-- événement familial est une ligne séparée avec sa raison).
CREATE UNIQUE INDEX IF NOT EXISTS conges_alloc_auto_unique
  ON conges_allocations(employe_id, annee, type)
  WHERE source = 'auto' AND statut = 'valide';

-- RLS : on autorise anon + authenticated (cohérent avec le reste du module).
ALTER TABLE conges_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conges_allocations_all ON conges_allocations;
CREATE POLICY conges_allocations_all
  ON conges_allocations
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
