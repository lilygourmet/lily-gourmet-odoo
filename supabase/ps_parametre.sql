-- Mémorise les modèles (commandes) déjà PARAMÉTRÉS dans Lily Studio.
-- Sert à la liste « 🎯 À paramétrer » : une fois coché « ✓ Paramétré », le modèle sort de la liste
-- (et c'est pareil sur tous les appareils). À lancer 1 fois dans Supabase (SQL editor).
create table if not exists ps_parametre (
  cake_key   text primary key,        -- identifiant du gâteau (n° commande + pers + titre)
  order_ref  text,
  done_by    uuid,
  done_at    timestamptz default now()
);
alter table ps_parametre enable row level security;
drop policy if exists ps_parametre_all on ps_parametre;
create policy ps_parametre_all on ps_parametre
  for all to authenticated using (true) with check (true);
