-- Bibliothèque d'images du Studio photos : bucket de stockage + table d'index.
-- À lancer dans Supabase (SQL editor) AVANT de déployer.

-- 1) Bucket public (lecture publique des images ; écriture/suppression = authentifiés)
insert into storage.buckets (id, name, public)
values ('photoshop', 'photoshop', true)
on conflict (id) do nothing;

-- 2) Table d'index des images (thème = dossier d'origine, path = chemin dans le bucket)
create table if not exists ps_photos (
  id         uuid primary key default gen_random_uuid(),
  theme      text,
  nom        text,
  path       text not null unique,
  width      integer,
  height     integer,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ps_photos_theme_idx on ps_photos (theme);

alter table ps_photos enable row level security;

-- Tout est réservé aux utilisateurs connectés (auth maison via JWT).
drop policy if exists ps_photos_all on ps_photos;
create policy ps_photos_all on ps_photos
  for all to authenticated using (true) with check (true);

-- 3) Politiques de stockage sur le bucket 'photoshop'
drop policy if exists ps_storage_read on storage.objects;
create policy ps_storage_read on storage.objects
  for select using (bucket_id = 'photoshop');

drop policy if exists ps_storage_write on storage.objects;
create policy ps_storage_write on storage.objects
  for insert to authenticated with check (bucket_id = 'photoshop');

drop policy if exists ps_storage_delete on storage.objects;
create policy ps_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'photoshop');
