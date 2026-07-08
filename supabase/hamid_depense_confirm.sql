-- Confirmation des dépenses déclarées par Hamid (le livreur) depuis son téléphone.
-- Une dépense déclarée par Hamid arrive en "pending" et ne compte dans le solde
-- Hamid qu'une fois confirmée par Meriem. Les dépenses existantes / saisies par
-- Meriem restent "confirmed" par défaut (donc comptées comme avant).
alter table caisse_hamid_depenses
  add column if not exists confirm_status text not null default 'confirmed';
alter table caisse_hamid_depenses
  add column if not exists confirmed_at timestamptz;
alter table caisse_hamid_depenses
  add column if not exists confirmed_by uuid;
