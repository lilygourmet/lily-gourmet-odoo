-- Permission « reçoit les notifications de modification par WhatsApp ».
-- À donner aux personnes (ex. 2) qui doivent être prévenues à chaque modification.
-- À lancer AVANT de déployer (sinon l'enregistrement de l'utilisateur échouera).
alter table profiles
  add column if not exists perm_notif_modif boolean default false;
