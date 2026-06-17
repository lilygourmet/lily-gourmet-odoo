-- Permission « Notif devis OCP » : qui reçoit le WhatsApp à chaque nouveau devis OCP.
alter table profiles add column if not exists perm_notif_ocp boolean default false;
