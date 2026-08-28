-- ============================================================
-- « Check CD- » : le double contrôle des gâteaux sortis du congélateur.
--
-- Une personne sort le gâteau (onglet CD Négatif, table freezer_done).
-- Une deuxième le revérifie ici, sélectionne, puis ENVOIE EN VALIDATION :
-- l'ordre de fabrication « N cm cakedesign » est alors validé dans Odoo,
-- à condition que son étage « N cm CD* » soit en stock.
--
-- Cette table ne garde QUE ce qui a été envoyé : la sélection avant envoi
-- reste dans l'écran, donc elle s'annule sans laisser de trace.
-- ============================================================
create table if not exists check_cd_done (
  odoo_mo_id   bigint primary key,        -- l'ordre « N cm cakedesign » validé
  odoo_mo_name text,                      -- WHLVP/MO/200068, pour la lecture humaine
  checked_by   uuid,                      -- qui a envoyé
  checked_at   timestamptz not null default now(),
  odoo_ok      boolean not null default false,   -- Odoo a-t-il accepté ?
  odoo_msg     text                       -- son refus, mot pour mot, si non
);

create index if not exists check_cd_done_date on check_cd_done (checked_at desc);

alter table check_cd_done enable row level security;
drop policy if exists check_cd_done_rw on check_cd_done;
create policy check_cd_done_rw on check_cd_done for all to authenticated using (true) with check (true);
