-- Suivi des feuilles de congé signées par l'employé.
-- À lancer AVANT de déployer (sinon le bouton « Signé » renverra une erreur).
alter table conges
  add column if not exists signe boolean default false;
