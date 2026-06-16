-- Gestion des articles du lien OCP depuis l'app (ajouter / enlever).
-- « hide » = masque un article par défaut ; « add » = ajoute un article (Odoo ou libre) ;
-- « hide_variant » = masque une variante/taille précise d'un produit (par variant_id).
create table if not exists ocp_overrides (
  id           bigserial primary key,
  action       text not null,             -- 'hide' | 'add' | 'hide_variant'
  category     text not null,             -- clé de catégorie (jus, pls, ent, gs, sal, cho, fru, sec, her, ver, vie, cak)
  label        text not null,             -- nom de l'article (ou libellé de la taille pour hide_variant)
  tmpl_id      bigint,                    -- produit Odoo (pour 'add' non libre, ou hide_variant)
  variant_hint text,                      -- parfum/variante (jus…)
  item_kind    text default 'unit',       -- unit | size | kg | free
  unit         text,                      -- ex. « boîte 250 g », « kg »
  is_free      boolean default false,     -- article hors Odoo (→ Autre + description)
  variant_id   bigint,                    -- variante Odoo précise (parfum/taille choisi/masqué)
  image        text,                      -- photo du produit ajouté (data URL), pour l'afficher dans le lien
  created_at   timestamptz default now()
);
-- Si la table existe déjà : ajoute les colonnes manquantes.
alter table ocp_overrides add column if not exists variant_id bigint;
alter table ocp_overrides add column if not exists image text;
alter table ocp_overrides enable row level security;
drop policy if exists ocp_ov_rw on ocp_overrides;
create policy ocp_ov_rw on ocp_overrides for all to authenticated using (true) with check (true);
-- Lecture publique (le lien OCP est sans login) :
drop policy if exists ocp_ov_read on ocp_overrides;
create policy ocp_ov_read on ocp_overrides for select to anon using (true);
