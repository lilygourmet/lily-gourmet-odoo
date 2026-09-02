-- Retenir l'ordre de fabrication Odoo lié à une déclaration « c'est fait »,
-- et s'il a été créé PAR L'APP. Annuler la ligne dans l'historique annule
-- alors l'ordre — mais jamais un ordre qu'Odoo tenait déjà de lui-même.
alter table public.prod_fabrications
  add column if not exists ordre text,
  add column if not exists ordre_cree boolean not null default false;
