-- ============================================================
-- LILY GOURMET — Pré-fiches accessoires (saisies à la prise de commande)
-- Quand on remplit les détails d'un accessoire (lots par type : couleur,
-- forme, zigzag, perles…) DÈS la prise de commande, on les stocke ici,
-- reliés à la LIGNE Odoo (odoo_line_id). L'onglet Accessoires (fiche de
-- production) s'en sert pour se PRÉ-REMPLIR (l'équipe confirme ensuite).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS gm_prefiches (
  odoo_line_id  bigint PRIMARY KEY,          -- id de la sale.order.line Odoo (lien stable)
  type_gm       text,
  lots          jsonb NOT NULL DEFAULT '[]'::jsonb,
  parfum_normal boolean NOT NULL DEFAULT false,
  tete_position text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gm_prefiches ENABLE ROW LEVEL SECURITY;

-- Accès réservé aux utilisateurs connectés (rôle authenticated), comme les autres tables.
DROP POLICY IF EXISTS gm_prefiches_authenticated ON gm_prefiches;
CREATE POLICY gm_prefiches_authenticated ON gm_prefiches
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
