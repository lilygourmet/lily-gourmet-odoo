-- ============================================================
-- LILY GOURMET - Lot d'ameliorations (revue des onglets 2026-05-27)
-- A executer dans Supabase SQL Editor. Relancable sans risque.
-- ============================================================

-- Vague 2 ----------------------------------------------------
-- #4 Note interne (privee, visible equipe) sur une conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- #3 Date d'echeance sur une tache
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
