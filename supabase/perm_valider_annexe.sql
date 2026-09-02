-- Permission « Valider Annexe » : confirmer dans Odoo les fabrications
-- déclarées à l'annexe (consomme les composants, entre le produit fini).
-- Irréversible, d'où une permission à part de perm_valider_of.
alter table public.profiles
  add column if not exists perm_valider_annexe boolean not null default false;
