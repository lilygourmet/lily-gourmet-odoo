-- ============================================================
-- Qui ouvre quels onglets — pour savoir ce qui sert vraiment, et ce que
-- personne n'ouvre jamais. 52 onglets déclarés en août 2026 : il faut des
-- chiffres pour décider quoi ranger, regrouper ou retirer.
--
-- UNE ligne par (personne, onglet, JOUR) : on écrit au plus une fois par jour
-- et par onglet, même si quelqu'un y revient vingt fois. C'est assez pour
-- classer, et ça évite d'ajouter des milliers d'écritures par jour à une base
-- qui a déjà connu une alerte Disk IO.
-- ============================================================
create table if not exists nav_usage (
  user_id  uuid not null,
  view     text not null,
  jour     date not null default current_date,
  vu_a     timestamptz not null default now(),
  primary key (user_id, view, jour)
);

create index if not exists nav_usage_jour on nav_usage (jour desc);
create index if not exists nav_usage_view on nav_usage (view);

alter table nav_usage enable row level security;
drop policy if exists nav_usage_rw on nav_usage;
create policy nav_usage_rw on nav_usage for all to authenticated using (true) with check (true);
