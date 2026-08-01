-- Factures OCP émises par l'app (document maison, numéro saisi à la main).
-- Sert de MÉMOIRE : les commandes déjà facturées ne réapparaissent plus dans la
-- liste « à facturer » du mois suivant. Rien n'est écrit dans Odoo.
--   order_ids = ids Odoo des sale.order inclus dans cette facture
--   contenu   = copie complète de la facture (événements, lignes, prix, en-tête)
--               pour pouvoir la rouvrir / la réimprimer à l'identique plus tard.
create table if not exists ocp_factures (
  id          bigserial primary key,
  numero      text not null,                 -- numéro saisi à la main par Layla
  date_facture date not null,
  periode_du  date,
  periode_au  date,
  order_ids   bigint[] not null default '{}',
  total_ht    numeric(12,2) default 0,
  total_tva   numeric(12,2) default 0,
  total_ttc   numeric(12,2) default 0,
  contenu     jsonb,
  created_by  uuid,
  created_at  timestamptz default now()
);

create index if not exists ocp_factures_order_ids_idx on ocp_factures using gin (order_ids);

alter table ocp_factures enable row level security;
drop policy if exists ocp_fact_rw on ocp_factures;
create policy ocp_fact_rw on ocp_factures for all to authenticated using (true) with check (true);

-- Qui a le droit de générer la facture OCP (les admins l'ont toujours).
alter table profiles add column if not exists perm_facture_ocp boolean not null default false;
