-- Validation d'un écart de montant (versement rapproché mais montant réel ≠ déclaré).
-- Une fois validé, le versement quitte l'onglet « Écart » et passe dans « Validés ».
alter table caisse_enveloppes
  add column if not exists ecart_valide_at timestamptz,
  add column if not exists ecart_valide_by uuid;
