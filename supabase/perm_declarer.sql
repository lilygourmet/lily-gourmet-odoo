-- ============================================================
-- LA PERMISSION « À DÉCLARER », À ELLE SEULE.
--
-- « Rajouter permission à déclarer à l'équipe » (Layla, 2026-09-21).
--
-- Jusqu'ici, l'onglet « À déclarer » s'ouvrait avec « Fabrication Annexe 2 » :
-- donner l'un donnait l'autre — les tournées, les mini/maxi, tout ce qui est
-- sous le mini. Or dire ce qu'on a fabriqué ne demande rien de tout ça.
--
-- ⚠️ Personne ne perd rien : qui a déjà « Fabrication Annexe 2 » continue de
-- voir « À déclarer » sans qu'on coche quoi que ce soit.
-- ============================================================
alter table profiles add column if not exists perm_declarer boolean not null default false;

comment on column profiles.perm_declarer is
  'Onglet « À déclarer » seul, sans le reste de Fabrication Annexe 2.';
