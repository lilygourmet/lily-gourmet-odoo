-- « Wati info » : envoyer une simple INFORMATION par WhatsApp à 1+ personnes
-- ou à un groupe (≠ tâche à faire). Permission + historique.

-- 1) Permission (admin + responsables)
alter table profiles add column if not exists perm_wati_info boolean default false;

-- 2) Historique des infos envoyées
create table if not exists wati_infos (
  id              bigint generated always as identity primary key,
  sender_user_id  uuid,
  sender_name     text,
  message         text not null,
  cible           text,              -- ex: "Groupe Cuisine", "3 personnes", "Tout le personnel"
  recipient_count int  default 0,
  sent_at         timestamptz not null default now()
);

alter table wati_infos enable row level security;
grant all on wati_infos to authenticated;
create policy "wati_infos authenticated" on wati_infos
  for all to authenticated using (true) with check (true);
