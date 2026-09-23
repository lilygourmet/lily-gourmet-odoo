-- ============================================================
-- « Recettes » — l'écran du chef (Layla, 2026-09-23).
--
-- « Le chef veut vérifier les recettes si elles sont bonnes avant de les
--   faire […] besoin de la perm à partager avec lui seul. »
--
-- L'écran ne fabrique RIEN et n'écrit RIEN dans Odoo : il lit les recettes et
-- laisse essayer une quantité ou un ingrédient, à l'écran seulement. Mais il
-- montre toutes les recettes de la maison — d'où sa propre permission.
--
-- À lancer dans Supabase → SQL Editor. Sans danger : la colonne est ajoutée à
-- false pour tout le monde, personne ne gagne ni ne perd un accès.
-- ============================================================

alter table public.profiles
  add column if not exists perm_recettes boolean not null default false;

-- Vérification : la colonne existe et personne ne l'a encore.
select count(*) filter (where perm_recettes) as ont_la_perm,
       count(*)                              as tout_le_monde
from public.profiles;
