-- Raison d'un versement « ignoré » au rapprochement (rien à lier dans le relevé).
-- Affichée dans le filtre « Ignorés » du suivi Banque.
alter table caisse_enveloppes
  add column if not exists releve_ignore_reason text;
