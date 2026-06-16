-- ============================================================
-- Étape « comptée, prête à envoyer en banque » sur les enveloppes.
-- Traçabilité : qui a confirmé le comptage + quand. À lancer dans Supabase.
-- ============================================================
alter table caisse_enveloppes add column if not exists pret_banque_at timestamptz;
alter table caisse_enveloppes add column if not exists pret_banque_by uuid references profiles(id);
