-- ============================================================
-- LA PERMISSION « DONNÉ », À ELLE SEULE.
--
-- « Crée aussi une permission pour Donné » (Layla, 2026-09-21).
--
-- Jusqu'ici, l'onglet « Donné » demandait un profil d'économat
-- (`economat_profil` ou `perm_econome`). Or voir ce qui a été donné ne demande
-- pas de gérer l'économat.
--
-- ⚠️ Personne ne perd rien : qui a déjà l'Économat continue de voir l'onglet.
-- ============================================================
alter table profiles add column if not exists perm_donne boolean not null default false;

comment on column profiles.perm_donne is
  'Onglet « Donné » (Économat) seul, sans profil d''économat.';
