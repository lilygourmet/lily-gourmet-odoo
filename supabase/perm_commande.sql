-- Permission « Nouvelle commande » : accès à l'écran de prise de commande (devis Odoo).
-- Les admins y ont accès d'office ; cette permission permet de l'accorder à un user précis.
alter table profiles add column if not exists perm_commande boolean default false;
