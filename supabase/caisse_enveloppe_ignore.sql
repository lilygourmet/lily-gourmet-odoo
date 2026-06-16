-- Permet d'« ignorer » un versement bancaire à lier (il disparaît de « En attente »).
-- À lancer AVANT de déployer (sinon le bouton « Ignorer » renverra une erreur).
alter table caisse_enveloppes
  add column if not exists releve_ignore boolean default false;
