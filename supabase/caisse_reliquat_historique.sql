-- Journal du reliquat de salaire : garde une trace PERMANENTE (sans rien écraser).
-- 'cree'     = un reliquat est né (surplus réuni sur un mois), reporté sur le mois suivant.
-- 'applique' = un report a été déduit (consommé) sur un mois donné.
create table if not exists caisse_reliquat_historique (
  id                bigserial primary key,
  type              text not null,        -- 'cree' | 'applique'
  beneficiaire      text not null,        -- 'nezha' | 'layla'
  amount            numeric not null,
  source_salaire_id bigint,               -- salaire d'où vient le reliquat
  source_month      int,
  source_year       int,
  target_salaire_id bigint,               -- salaire qui a consommé le report (type 'applique')
  target_month      int,
  target_year       int,
  created_at        timestamptz default now()
);
-- Sécurité : réservé aux utilisateurs connectés (comme les autres tables salaires), jamais anon.
alter table caisse_reliquat_historique enable row level security;
drop policy if exists "auth all caisse_reliquat_historique" on caisse_reliquat_historique;
create policy "auth all caisse_reliquat_historique" on caisse_reliquat_historique
  for all to authenticated using (true) with check (true);
