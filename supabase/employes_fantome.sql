-- Employés « fantômes » : comptes actifs mais MASQUÉS des suivis RH
-- (pointage, absences à traiter, congés/soldes). Restent visibles et gérables
-- par l'admin dans l'onglet Employés. Usage : propriétaires / famille qui
-- figurent en employé (Odoo, salaires) mais ne sont pas suivis au quotidien.
alter table employes add column if not exists fantome boolean not null default false;

-- Marquer les 4 cas connus (noms exacts issus de l'audit du 2026-06-07) :
update employes set fantome = true
  where nom in ('BADEA BAHRI', 'LAYLA EL AMRANI JAMAL', 'NEZHA AOUAD', 'RACHIDA EL HAIMER');
