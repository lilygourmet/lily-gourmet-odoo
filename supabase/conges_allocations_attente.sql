-- ============================================================
-- Ajoute le statut 'attente' aux allocations (workflow approbation RH → admin)
-- + colonnes valide_par / valide_le pour tracer qui a validé et quand.
-- À exécuter AVANT déploiement du code qui utilise 'attente'.
-- ============================================================

ALTER TABLE conges_allocations
  DROP CONSTRAINT IF EXISTS conges_allocations_statut_check;

ALTER TABLE conges_allocations
  ADD CONSTRAINT conges_allocations_statut_check
  CHECK (statut IN ('valide', 'attente', 'annule'));

ALTER TABLE conges_allocations
  ADD COLUMN IF NOT EXISTS valide_par UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valide_le  TIMESTAMPTZ;
