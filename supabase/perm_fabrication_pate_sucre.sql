-- ============================================================
-- Permission de l'onglet « Fabrication Pâte à sucre ».
-- Même principe que perm_fabrication_glacage : la personne peut lancer des
-- tournées de pâte à sucre (l'ordre part ensuite dans « À valider »).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perm_fabrication_pate_sucre BOOLEAN NOT NULL DEFAULT false;
