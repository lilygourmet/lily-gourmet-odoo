-- ============================================================
-- LILY GOURMET — Besoins d'achat d'une commande (cake design)
-- Dans la fiche commande CD-, la personne cake design coche ce qu'il faut
-- acheter (plaque/poly/fleurs/jouet/autre) → crée une TÂCHE urgente vers
-- les « responsables d'achat », avec échéance = date de la commande.
-- 2 permissions + 1 table mémoire (ne redemande plus une fois répondu).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

-- QUI voit/coche la liste dans la fiche commande :
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_besoins_achat boolean NOT NULL DEFAULT false;
-- QUI reçoit la tâche (rôle « achat ») :
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_achat boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS besoins_achat (
  order_num  text PRIMARY KEY,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- besoins cochés [{key,label,detail}]
  task_id    uuid,                                  -- 1re tâche créée (lien)
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE besoins_achat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS besoins_achat_authenticated ON besoins_achat;
CREATE POLICY besoins_achat_authenticated ON besoins_achat
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
