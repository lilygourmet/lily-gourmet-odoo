-- Permet d'IGNORER une ligne de relevé « à lier » (versement/dépôt sans enveloppe),
-- avec une explication, et de la ranger à part (filtre « Ignorés »).
alter table caisse_releve_lignes
  add column if not exists ignored boolean not null default false,
  add column if not exists ignore_reason text;
