-- Journal brut des requêtes de la pointeuse ZKTeco (push / ADMS).
-- Sert à OBSERVER ce que l'appareil envoie (handshake, pointages) avant de
-- brancher l'écriture dans Odoo. Écrit par le serveur (clé service).
-- À lancer une fois dans Supabase (SQL Editor).

create table if not exists zk_events (
  id     bigserial primary key,
  ts     timestamptz not null default now(),
  sn     text,
  method text,
  path   text,
  query  jsonb,
  body   text
);
