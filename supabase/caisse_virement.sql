-- ============================================================
-- LILY GOURMET — Caisse : onglet « Virement bancaire »
-- 1 enveloppe par paiement virement client (≠ espèces/chèque qui restent groupés).
-- À exécuter dans Supabase SQL Editor AVANT de déployer le code. Relançable sans risque.
-- ============================================================

-- Identifiant du paiement Odoo (pour 1 enveloppe par virement + anti-doublon)
ALTER TABLE caisse_enveloppes ADD COLUMN IF NOT EXISTS odoo_payment_id BIGINT;

-- Nom du client (lisible dans le libellé du relevé bancaire)
ALTER TABLE caisse_enveloppes ADD COLUMN IF NOT EXISTS virement_client TEXT;

-- Permettre plusieurs enveloppes pour une même session (espèces + chèque + N virements).
-- (Le dédoublonnage espèces/chèque se fait déjà côté code, pas par contrainte.)
ALTER TABLE caisse_enveloppes DROP CONSTRAINT IF EXISTS caisse_enveloppes_odoo_session_id_key;

-- Anti-doublon des virements : 1 enveloppe max par paiement Odoo
CREATE UNIQUE INDEX IF NOT EXISTS idx_enveloppes_odoo_payment
  ON caisse_enveloppes(odoo_payment_id) WHERE odoo_payment_id IS NOT NULL;

-- Autoriser la valeur 'virement' dans la contrainte payment_method
-- (la contrainte n'autorisait que cash/cheque — ajoutée à la main en base)
ALTER TABLE caisse_enveloppes DROP CONSTRAINT IF EXISTS caisse_enveloppes_payment_method_check;
ALTER TABLE caisse_enveloppes ADD CONSTRAINT caisse_enveloppes_payment_method_check
  CHECK (payment_method IN ('cash', 'cheque', 'virement'));

-- L'unique (session, moyen) bloquait plusieurs virements par session.
-- On le remplace par un unique partiel qui ne concerne QUE espèces/chèques
-- (les virements sont dédoublonnés par odoo_payment_id ci-dessus).
ALTER TABLE caisse_enveloppes DROP CONSTRAINT IF EXISTS caisse_enveloppes_odoo_session_method_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enveloppes_session_method_cashcheque
  ON caisse_enveloppes(odoo_session_id, payment_method)
  WHERE payment_method IN ('cash', 'cheque');
